import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers(){return [{source:'/slack-calendar/:path*',headers:[{key:'Cache-Control',value:'no-cache'}]},{source:'/slack/calendar',headers:[{key:'Content-Security-Policy',value:"frame-ancestors https://*.slack.com https://*.slack-gov.com https://*.slack-mcps.com"},{key:'Cache-Control',value:'private, no-store'}]},{source:'/:path*',headers:[{key:'Referrer-Policy',value:'no-referrer'}]}]}
};

export default nextConfig;
