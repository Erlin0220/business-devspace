import { readJson } from '../client/state.mjs';

export function validateDeploymentAdmin(admin, gateway) {
  if (!admin || typeof admin.adminToken !== 'string' || admin.adminToken.length < 32 ||
      typeof admin.masterKeyV2 !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(admin.masterKeyV2)) {
    throw new Error('Restore the existing ADMIN_TOKEN and canonical MASTER_KEY_V2 from protected credentials before deploying; deployment never creates or migrates encryption roots.');
  }
  if (admin.gateway !== gateway) throw new Error('Existing administrator state belongs to a different gateway');
  return admin;
}

export async function deploymentConfig(env = process.env) {
  let config;
  try { config = env.TEAM_DEVSPACE_DEPLOYMENT_JSON ? JSON.parse(env.TEAM_DEVSPACE_DEPLOYMENT_JSON)
    : await readJson('.runtime/deployment.json'); }
  catch { throw new Error('Supply TEAM_DEVSPACE_DEPLOYMENT_JSON or private .runtime/deployment.json'); }
  const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
  if (!config || Object.keys(config).some(key => !['zoneId', 'databaseId', 'accessApplicationId'].includes(key)) ||
      !/^[a-f0-9]{32}$/.test(config.zoneId ?? '') || !uuid.test(config.databaseId ?? '') ||
      (config.accessApplicationId !== null && !uuid.test(config.accessApplicationId ?? ''))) {
    throw new Error('Invalid private deployment configuration');
  }
  return config;
}
