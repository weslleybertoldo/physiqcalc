// Mock lovable auth for offline usage
export const lovable = {
  auth: {
    signInWithOAuth: async (_provider: string, _options?: any) => {
      return { error: { message: "OAuth não disponível no modo offline. Use email e senha." } };
    },
  },
};
