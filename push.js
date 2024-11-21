// push.js

const webPush = require("web-push");
const { Pool } = require("pg");

// VAPID 키 설정 (Firebase 웹 푸시 인증)
const vapidKeys = {
  publicKey:
    "BOr1ZRzOF7UEGY4ylBTfjC6sCUBJuH71QVI_NB_OK3L4DfrHxI5pvbRVmRrcTm8W2s_V-nWxDyidcxEVlk_igwA",
  privateKey: "sm1fHToM94BoQ24wrsHUFpRdM9Zb9yhS-ApsZ6W_i9w",
};

webPush.setVapidDetails(
  "mailto:example@example.com",
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

// DB 연결
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// DB에 구독 정보 저장
function saveSubscriptionToDB(subscription) {
  const { endpoint, keys } = subscription;
  const { auth, p256dh } = keys;

  pool.query(
    "INSERT INTO subscriptions (endpoint, auth, p256dh) VALUES ($1, $2, $3)",
    [endpoint, auth, p256dh],
    (err) => {
      if (err) {
        console.error("Error saving subscription to DB:", err);
      } else {
        console.log("Subscription saved successfully");
      }
    }
  );
}

// 푸시 알림을 보내는 함수
function sendPushNotification(title, body) {
  pool.query("SELECT * FROM subscriptions", (err, res) => {
    if (err) {
      console.error("Error fetching subscriptions from DB:", err);
      return;
    }

    const subscriptions = res.rows;

    subscriptions.forEach((subscription) => {
      const payload = {
        notification: {
          title: title,
          body: body,
        },
      };

      webPush
        .sendNotification(subscription, JSON.stringify(payload))
        .then(() => {
          console.log("Notification sent to:", subscription.endpoint);
        })
        .catch((error) => {
          console.error("Error sending notification:", error);
        });
    });
  });
}

module.exports = { saveSubscriptionToDB, sendPushNotification };
