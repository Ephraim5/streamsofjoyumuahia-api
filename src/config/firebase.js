
 var admin = require("firebase-admin");

var serviceAccount = require("./streamsofjoy-149f0-firebase-adminsdk-fbsvc-684fa0bf84.json");

const firebaseAdmin= admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});



module.exports = firebaseAdmin ;
