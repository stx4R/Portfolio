// Play CDN이 쓰던 것과 동일한 기본 설정
// ㄴ index.html 원문을 훑어서 JS 문자열 안 클래스명까지 잡음
module.exports = {
  content: [require('path').join(__dirname, '..', 'index.html')],
};
