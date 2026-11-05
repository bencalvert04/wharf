import {json} from '@/lib/auth';
import {appleLoginAvailable} from '@/lib/apple-signin';
import {configured} from '@/lib/google';
import {microsoftConfigured} from '@/lib/microsoft-calendar';
import {tokenVaultConfigured} from '@/lib/token-vault';
export function GET(){return json({google:configured(),microsoft:microsoftConfigured()&&tokenVaultConfigured(),icloud:false,apple:appleLoginAvailable()})}
