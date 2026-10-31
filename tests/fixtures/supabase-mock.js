/* Mock exclusivo dos testes. Nenhuma chamada chega ao Supabase real. */
(function () {
  window.__alicerceMockSignIn = null;
  window.__alicerceMockSignUp = null;
  window.__alicerceMockPasswordReset = null;
  window.__alicerceMockAuthListener = null;
  window.__alicerceMockUpserts = [];
  window.__alicerceMockTables = [];

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
          signUp: async function (credentials) {
            window.__alicerceMockSignUp = {
              email: String(credentials && credentials.email || ''),
              passwordWasProvided: Boolean(credentials && credentials.password),
              referralCode: String(credentials && credentials.options && credentials.options.data && credentials.options.data.referral_code || '')
            };
            return {
              data: {
                user: {
                  id: 'alicerce-mock-signup-user',
                  email: String(credentials && credentials.email || '')
                },
                session: null
              },
              error: null
            };
          },
          resetPasswordForEmail: async function (email, options) {
            window.__alicerceMockPasswordReset = {
              email: String(email || ''),
              redirectTo: String(options && options.redirectTo || '')
            };
            return { data: {}, error: null };
          },
          signOut: async function () {
            return { data: {}, error: null };
          }
        },
        from: function (tableName) {
          var table = String(tableName || '');
          window.__alicerceMockTables.push(table);
          var query = {
            select: function () { return query; },
            eq: function () { return query; },
            order: function () { return query; },
            limit: function () { return Promise.resolve({ data: [], error: null }); },
            maybeSingle: function () { return Promise.resolve({ data: null, error: null }); },
            upsert: async function (payload, options) {
              window.__alicerceMockUpserts.push({
                table: table,
                payload: payload || null,
                options: options || null
              });
              return { data: null, error: null };
            },
            then: function (resolve, reject) {
              return Promise.resolve({ data: [], error: null }).then(resolve, reject);
            }
          };
          return query;
        },
        rpc: async function () {
          return { data: null, error: { message: 'RPC disabled in UI tests' } };
        }
      };
    }
  };
})();
