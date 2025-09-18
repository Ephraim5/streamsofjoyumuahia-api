const nodemailer = require('nodemailer');

const sendEmail = async (to, subject, html) => {
  try {
    const transporter = nodemailer.createTransport({
      host: 'gtxm1088.siteground.biz',
      port: 465,
      secure: true, // true for 465, false for other ports
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    // Verify connection configuration
    await transporter.verify();
    console.log('SMTP server is ready to send emails.');

    // Send the email
    await transporter.sendMail({
      from: `"Chantal Ekabe Ministry" <${process.env.EMAIL_USER}>`, // Optional: Customize sender name
      to,
      subject,
      html
    });

    console.log(`Email sent to ${to}`);
  } catch (error) {
    console.error('Failed to send email:', error.message);
    throw new Error('Email delivery failed.');
  }
};

module.exports = sendEmail;
