require('dotenv').config();
const nodemailer = require('nodemailer');
(async()=>{
  const t = nodemailer.createTransport({
    host:'smtp.gmail.com', port:587, secure:false, requireTLS:true,
    auth:{ user:process.env.EMAIL_USER, pass:process.env.EMAIL_PASS },
    connectionTimeout:6000, greetingTimeout:6000, socketTimeout:10000,
    tls:{ servername:'smtp.gmail.com' }
  });
  try {
    const info = await t.sendMail({ from:`"ZeroNetPay" <${process.env.EMAIL_USER}>`, to:'amoghsram@gmail.com', subject:'ZeroNetPay Gmail probe', text:'gmail probe', html:'<b>gmail probe</b>' });
    console.log('GMAIL_OK', info.messageId);
  } catch(e) {
    console.error('GMAIL_ERR', e?.message || e);
  }
})();
