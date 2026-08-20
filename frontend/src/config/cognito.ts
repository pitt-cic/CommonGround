import { CognitoUserPool } from 'amazon-cognito-identity-js';

const poolData = {
  UserPoolId: import.meta.env.VITE_USER_POOL_ID || '',
  ClientId: import.meta.env.VITE_USER_POOL_CLIENT_ID || '',
};

export const userPool = new CognitoUserPool(poolData);

export const cognitoConfig = {
  region: import.meta.env.VITE_AWS_REGION || 'us-east-1',
  userPoolId: poolData.UserPoolId,
  clientId: poolData.ClientId,
};
