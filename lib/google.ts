import {OAuth2Client,CodeChallengeMethod} from 'google-auth-library';
import {appUrl} from './auth';
import {allowed,type Constraints,type Interval} from './availability';
export const configured=()=>!!(process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET);
export const google=(signal?:AbortSignal)=>new OAuth2Client({clientId:process.env.GOOGLE_CLIENT_ID,clientSecret:process.env.GOOGLE_CLIENT_SECRET,redirectUri:appUrl()+'/api/auth/google/callback',...(signal?{transporterOptions:{signal,timeout:15000,retry:false}}:{})});
export const challengeMethod=CodeChallengeMethod.S256;
export {parseBusy} from './calendar-data';
