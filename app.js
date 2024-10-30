require("dotenv").config(); // dotenv 불러오기
const express = require("express");
const request = require("request");
const app = express();

const PORT = 3000;

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});

app.get("/safemap", (req, res) => {
  // 요청된 URL에서 `apikey`가 이미 포함된 경우 중복 추가를 방지
  const apiUrl = `http://www.safemap.go.kr/sm/apis.do?${req.originalUrl
    .split("?")[1]
    .replace(/&?apikey=[^&]*/, "")}&apikey=${process.env.SAFEMAP_API_KEY}`;

  console.log("Safemap API 요청 URL:", apiUrl); // 요청 URL 로그 출력

  request(apiUrl, (err, resp, body) => {
    if (err) {
      return res.status(500).send(err);
    }

    console.log("Safemap API 응답:", body); // 응답 로그 출력
    res.send(body);
  });
});

app.listen(PORT, () => {
  console.log(`Proxy server is running at http://localhost:${PORT}`);
});
