import {OAuth2Client,CodeChallengeMethod} from 'google-auth-library';
import {appUrl} from './auth';
import {allowed,type Constraints,type Interval} from './availability';
export const configured=()=>!!(process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET);
export const google=()=>new OAuth2Client(process.env.GOOGLE_CLIENT_ID,process.env.GOOGLE_CLIENT_SECRET,appUrl()+'/api/auth/google/callback');
export const challengeMethod=CodeChallengeMethod.S256;
export {parseBusy} from './calendar-data';
