const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const pushNotificationService = require("./push");
const admin = require("firebase-admin");
// 배포용
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
//const serviceAccount = require("./serviceAccountKey.json");
const app = express();
app.use(cors({ origin: "*" })); // 모든 도메인에 대해 허용
app.use(express.json()); // JSON 형태의 요청을 처리

// Firebase Admin SDK 초기화
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Firebase Cloud Messaging 사용
const messaging = admin.messaging();

// DB 연결 설정

// 배포용
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// // 테스트용
// const pool = new Pool({
//   user: "postgres",
//   host: "localhost",
//   database: "flood_prevention",
//   password: "1114",
//   port: 5432,
// });

// DB에 구독 정보 저장
app.post("/api/save-subscription", (req, res) => {
  const subscription = req.body;

  // FCM 토큰을 DB에 저장하기
  const { endpoint, keys } = subscription;
  const { auth, p256dh } = keys;

  // FCM의 토큰(endpoint)을 DB에 저장
  pool.query(
    "INSERT INTO subscriptions (endpoint, auth, p256dh) VALUES ($1, $2, $3) ON CONFLICT (endpoint) DO UPDATE SET auth = $2, p256dh = $3",
    [endpoint, auth, p256dh], // 실제 값들을 전달
    (err) => {
      if (err) {
        console.error("Error saving subscription to DB:", err);
        return res.status(500).json({ error: "Error saving subscription." });
      }
      console.log("Subscription saved successfully.");
      res.status(201).json({ message: "Subscription saved successfully." });
    }
  );
});

// 푸시 알림 전송 API
app.post("/api/send-notification", (req, res) => {
  const { title, body } = req.body;

  // DB에서 구독 정보(FCM 토큰) 조회
  pool.query("SELECT * FROM subscriptions", (err, result) => {
    if (err) {
      console.error("Error fetching subscriptions from DB:", err);
      return res.status(500).json({ error: "Error fetching subscriptions." });
    }

    const subscriptions = result.rows;

    // FCM을 통해 알림 보내기
    const messages = subscriptions.map((subscription) => {
      const registrationToken = subscription.endpoint; // FCM 토큰을 endpoint로 사용

      const payload = {
        notification: {
          title: title,
          body: body,
        },
      };

      return messaging
        .sendToDevice(registrationToken, payload) // Firebase FCM 사용
        .then(() => {
          console.log("FCM Notification sent to:", registrationToken);
        })
        .catch((error) => {
          console.error("Error sending FCM notification:", error);
        });
    });

    // 모든 알림 전송 완료 후 응답
    Promise.all(messages)
      .then(() => {
        res.status(200).json({ message: "Notifications sent successfully." });
      })
      .catch((error) => {
        res.status(500).json({ error: "Error sending notifications." });
      });
  });
});

// 주차 위치 등록 API
app.post("/api/registerParking", async (req, res) => {
  const { userUUID, lat, lon } = req.body;
  if (!userUUID || typeof lat !== "number" || typeof lon !== "number") {
    return res.status(400).json({ error: "Invalid input data" });
  }
  res.status(200).json({
    success: true,
    message: "Parking location registered.",
    parkingData: { lat, lon },
  });
});

// 침수 이력 확인 API
app.post("/api/checkFloodHistory", async (req, res) => {
  const { lat, lon } = req.body;
  if (typeof lat !== "number" || typeof lon !== "number") {
    return res.status(400).json({ error: "Invalid coordinates." });
  }
  try {
    const floodResult = await pool.query(
      `SELECT id FROM flood_history
       WHERE ST_Contains(
       location,
       ST_Transform(ST_SetSRID(ST_MakePoint($1, $2), 4326), 3857)
       )`,
      [lon, lat]
    );
    res.status(200).json({ floodHistory: floodResult.rows.length > 0 });
  } catch (error) {
    console.error("Error checking flood history:", error);
    res.status(500).send("Error checking flood history.");
  }
});

// 침수 유발 강우량 정보 가져오기 API
app.post("/api/getFloodThresholds", async (req, res) => {
  const { lat, lon } = req.body;
  if (typeof lat !== "number" || typeof lon !== "number") {
    return res.status(400).json({ error: "Invalid coordinates." });
  }
  try {
    const rangeQuery = `
      SELECT depth_10, depth_20, depth_50
      FROM flood_rainfall_thresholds
      WHERE lat_min <= $1 AND lat_max >= $1
        AND lon_min <= $2 AND lon_max >= $2
      LIMIT 1;`;
    let result = await pool.query(rangeQuery, [lat, lon]);
    if (result.rows.length > 0) {
      return res.status(200).json(result.rows[0]);
    }
    const nearestQuery = `
      SELECT depth_10, depth_20, depth_50,
      SQRT(POW((lat_min + lat_max) / 2 - $1, 2) + POW((lon_min + lon_max) / 2 - $2, 2)) AS distance
      FROM flood_rainfall_thresholds
      ORDER BY distance
      LIMIT 1;`;
    result = await pool.query(nearestQuery, [lat, lon]);
    if (result.rows.length > 0) {
      return res.status(200).json(result.rows[0]);
    } else {
      return res.status(404).json({
        depth_10: null,
        depth_20: null,
        depth_50: null,
      });
    }
  } catch (error) {
    console.error("Error fetching flood thresholds:", error);
    res.status(500).send("Error fetching flood thresholds.");
  }
});

app.listen(3000, () => {
  console.log("Server running on http://0.0.0.0:3000");
});
