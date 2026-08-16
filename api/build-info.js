export default function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.status(200).json({
    environment: process.env.VERCEL_ENV || 'development',
    branch: process.env.VERCEL_GIT_COMMIT_REF || 'threejs-rebuild',
    sha: process.env.VERCEL_GIT_COMMIT_SHA || 'local',
  });
}
