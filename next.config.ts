import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {agentUpgrade: 'security'},
  async headers(){return [{source:'/:path*',headers:[{key:'Referrer-Policy',value:'no-referrer'}]},{source:'/',headers:[{key:'Link',value:'</llms.txt>; rel="describedby"; type="text/plain", </api/agent>; rel="service-desc"; type="application/json", </openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json"'}]}]}
};

export default nextConfig;
