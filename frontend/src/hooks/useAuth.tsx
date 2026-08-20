import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserAttribute,
  type CognitoUserSession,
} from 'amazon-cognito-identity-js';
import { type ReactNode, createContext, useCallback, useContext, useEffect, useState } from 'react';
import { userPool } from '../config/cognito';

export interface AuthUser {
  name: string;
  email: string;
  initials: string;
}

function userFromSession(session: CognitoUserSession): AuthUser {
  const payload = session.getIdToken().decodePayload();
  const email: string = payload['email'] ?? '';
  const given: string = payload['given_name'] ?? '';
  const family: string = payload['family_name'] ?? '';
  const name = [given, family].filter(Boolean).join(' ') || email.split('@')[0];
  const initials = given && family
    ? (given[0] + family[0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
  return { name, email, initials };
}

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  user: AuthUser | null;
  cognitoUser: CognitoUser | null;
  userAttributes: Record<string, string>;
  login: (email: string, password: string) => Promise<LoginResult>;
  signUp: (email: string, password: string, attrs: SignUpAttrs) => Promise<void>;
  confirmSignUp: (email: string, code: string) => Promise<void>;
  logout: () => void;
  completeNewPasswordChallenge: (
    newPassword: string,
    attributes?: { givenName?: string; familyName?: string },
  ) => Promise<void>;
  clearError: () => void;
}

export interface SignUpAttrs {
  firstName: string;
  lastName: string;
}

type LoginResult =
  | { status: 'success'; session: CognitoUserSession }
  | { status: 'newPasswordRequired'; userAttributes: Record<string, string> };

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true); // true until session check completes
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [cognitoUser, setCognitoUser] = useState<CognitoUser | null>(null);
  const [userAttributes, setUserAttributes] = useState<Record<string, string>>({});

  useEffect(() => {
    const currentUser = userPool.getCurrentUser();
    if (!currentUser) {
      setIsLoading(false);
      return;
    }
    currentUser.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session?.isValid()) {
        setIsLoading(false);
        return;
      }
      setIsAuthenticated(true);
      setCognitoUser(currentUser);
      setUser(userFromSession(session));
      setIsLoading(false);
    });
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    setIsLoading(true);
    setError(null);

    const user = new CognitoUser({
      Username: email,
      Pool: userPool,
    });

    const authDetails = new AuthenticationDetails({
      Username: email,
      Password: password,
    });

    return new Promise((resolve, reject) => {
      user.authenticateUser(authDetails, {
        onSuccess: (session) => {
          setIsAuthenticated(true);
          setCognitoUser(user);
          setUser(userFromSession(session));
          setIsLoading(false);
          resolve({ status: 'success', session });
        },
        onFailure: (err) => {
          setIsLoading(false);
          const message = err.message || 'Authentication failed';
          setError(message);
          reject(new Error(message));
        },
        newPasswordRequired: (attrs) => {
          setCognitoUser(user);
          setUserAttributes(attrs);
          setIsLoading(false);
          resolve({ status: 'newPasswordRequired', userAttributes: attrs });
        },
      });
    });
  }, []);

  const signUp = useCallback(async (email: string, password: string, attrs: SignUpAttrs): Promise<void> => {
    setIsLoading(true);
    setError(null);
    const attributeList = [
      new CognitoUserAttribute({ Name: 'email', Value: email }),
      new CognitoUserAttribute({ Name: 'given_name', Value: attrs.firstName }),
      new CognitoUserAttribute({ Name: 'family_name', Value: attrs.lastName }),
    ];
    return new Promise((resolve, reject) => {
      userPool.signUp(email, password, attributeList, [], (err) => {
        setIsLoading(false);
        if (err) {
          const message = err.message || 'Sign up failed';
          setError(message);
          reject(new Error(message));
        } else {
          resolve();
        }
      });
    });
  }, []);

  const confirmSignUp = useCallback(async (email: string, code: string): Promise<void> => {
    setIsLoading(true);
    setError(null);
    const user = new CognitoUser({ Username: email, Pool: userPool });
    return new Promise((resolve, reject) => {
      user.confirmRegistration(code, true, (err) => {
        setIsLoading(false);
        if (err) {
          const message = err.message || 'Confirmation failed';
          setError(message);
          reject(new Error(message));
        } else {
          resolve();
        }
      });
    });
  }, []);

  const completeNewPasswordChallenge = useCallback(
    async (
      newPassword: string,
      attributes?: { givenName?: string; familyName?: string },
    ): Promise<void> => {
      if (!cognitoUser) {
        throw new Error('No user session found');
      }

      setIsLoading(true);
      setError(null);

      const requiredAttributes: Record<string, string> = {};
      if (attributes?.givenName) {
        requiredAttributes.given_name = attributes.givenName;
      }
      if (attributes?.familyName) {
        requiredAttributes.family_name = attributes.familyName;
      }

      return new Promise((resolve, reject) => {
        cognitoUser.completeNewPasswordChallenge(newPassword, requiredAttributes, {
          onSuccess: (session) => {
            setIsAuthenticated(true);
            setUser(userFromSession(session));
            setIsLoading(false);
            resolve();
          },
          onFailure: (err) => {
            setIsLoading(false);
            const message = err.message || 'Password change failed';
            setError(message);
            reject(new Error(message));
          },
        });
      });
    },
    [cognitoUser],
  );

  const logout = useCallback(() => {
    const user = userPool.getCurrentUser();
    if (user) {
      user.signOut();
    }
    setIsAuthenticated(false);
    setUser(null);
    setCognitoUser(null);
    setUserAttributes({});
    setError(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        error,
        user,
        cognitoUser,
        userAttributes,
        login,
        signUp,
        confirmSignUp,
        logout,
        completeNewPasswordChallenge,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
