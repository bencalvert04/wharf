import nodemailer from 'nodemailer';
const user=process.env.INVITATION_FROM;
const pass=process.env.GMAIL_APP_PASSWORD?.replace(/\s/g,'');
if(!user||!pass){console.error('Set INVITATION_FROM and GMAIL_APP_PASSWORD in .env.local first.');process.exit(1)}
try{
 await nodemailer.createTransport({host:'smtp.gmail.com',port:465,secure:true,auth:{user,pass},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000}).verify();
 console.log('Gmail SMTP authentication succeeded. No email was sent.');
}catch{console.error('Gmail SMTP verification failed. Check the account, App Password, and network connection.');process.exitCode=1}
