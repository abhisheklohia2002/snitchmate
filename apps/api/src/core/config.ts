export const isProd=process.env.NODE_ENV==='production';
export function validateConfig(){
  for(const key of ['DATABASE_URL','SESSION_SECRET','OTP_SECRET']){
    if(!process.env[key]) throw new Error(`Missing ${key}`);
  }
  for(const key of ['SESSION_SECRET','OTP_SECRET']){
    if(isProd && (process.env[key]??'').length<32) throw new Error(`${key} must be at least 32 chars`);
  }
  const rate=Number(process.env.PLATFORM_COMMISSION_BPS??'1500');
  const windowHours=Number(process.env.FIT_CLAIM_WINDOW_HOURS??'48');
  if(!Number.isInteger(rate)||rate<0||rate>10000)throw new Error('PLATFORM_COMMISSION_BPS out of range');
  if(!Number.isInteger(windowHours)||windowHours<1||windowHours>336)throw new Error('FIT_CLAIM_WINDOW_HOURS out of range');
  if(isProd){
    if(process.env.MOCK_OTP_ENABLED==='true' || process.env.MOCK_PAYMENT_ENABLED==='true' || process.env.ENABLE_DEMO_PAYMENT_CONFIRM==='true') throw new Error('Mock providers are disabled in production');
    for(const key of ['RAZORPAY_KEY_ID','RAZORPAY_KEY_SECRET','RAZORPAY_WEBHOOK_SECRET','AWS_REGION','S3_BUCKET','S3_ACCESS_KEY_ID','S3_SECRET_ACCESS_KEY']){
      if(!process.env[key]) throw new Error(`Production config requires ${key}`);
    }
    if(process.env.SMS_PROVIDER==='webhook'){
      if(!process.env.SMS_WEBHOOK_URL?.startsWith('https://') || !process.env.SMS_WEBHOOK_KEY) throw new Error('Production requires a secure SMS webhook provider');
    }else if(process.env.SMS_PROVIDER==='msgkart'){
      for(const key of ['MSGKART_BUSINESS_ID','MSGKART_API_KEY','MSGKART_PHONE_ID','MSGKART_OTP_TEMPLATE_NAME']){
        if(!process.env[key]) throw new Error(`Production requires ${key}`);
      }
      const endpoint=new URL(process.env.MSGKART_API_URL || 'https://alb-backend.msgkart.com/api/v1');
      if(endpoint.protocol!=='https:' || endpoint.hostname!=='alb-backend.msgkart.com') throw new Error('Production requires the MSGKART HTTPS endpoint');
    }else{
      throw new Error('Production requires an OTP delivery provider (webhook or msgkart)');
    }
    if(!process.env.WEB_ORIGIN?.startsWith('https://')) throw new Error('WEB_ORIGIN must be HTTPS in production');
  }
}
export function mockOtpAllowed(){return !isProd && process.env.MOCK_OTP_ENABLED==='true';}
export function mockPaymentsAllowed(){return !isProd && process.env.MOCK_PAYMENT_ENABLED==='true';}
