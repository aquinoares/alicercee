/* Mock exclusivo dos testes. Nenhuma chamada chega ao Supabase real. */
(function () {
  window.__alicerceMockSignIn = null;
  window.__alicerceMockAuthListener = null;

  window.supabase = {
    createClient: function () {
      return {
        auth: {
          getSession: async function () {
            return { data: { session: null }, error: null };
          },
          onAuthStateChange: function (callback) {
            window.__alicerceMockAuthListener = callback;
            return {
              data: {
                subscription: {
                  unsubscribe: function () {}
                }
              }
            };
          },
          signInWithPassword: async function (credentials) {
            window.__alicerceMockSignIn = {
              email: String(credentials && credentials.email || ''),
              passwordWasProvided: Boolean(credentials && credentials.password)
            };
            return {
              data: { user: null, session: null },
              error: { message: 'Invalid login credentials' }
            };
          },
          signUp: async function () {
            return {
              data: { user: null, session: null },
              error: { message: 'Mock sign-up response' }
            };
          },
          resetPasswordForEmail: async function () {
            return { data: {}, error: null };
          },
          signOut: async function () {
            return { data: {}, error: null };
          }
        },
        from: function () {
          return {
            select: function () {
              return Promise.resolve({ data: [], error: null });
            }
          };
        },
        rpc: async function () {
          return { data: null, error: { message: 'RPC disabled in UI tests' } };
        }
      };
    }
  };
})();
