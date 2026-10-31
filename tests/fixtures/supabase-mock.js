/* Mock exclusivo dos testes. Nenhuma chamada chega ao Supabase real. */
(function () {
  window.__alicerceMockSignIn = null;
  window.__alicerceMockSignUp = null;
  window.__alicerceMockPasswordReset = null;
  window.__alicerceMockAuthListener = null;
  window.__alicerceMockUpserts = [];
  window.__alicerceMockTables = [];
  window.__alicerceMockSessionUserId = null;
  window.__alicerceMockCloudRows = [];
  window.__alicerceMockUpsertError = null;

  window.supabase = {
    createClient: function () {
      return {
        auth: {
          getSession: async function () {
            var userId = window.__alicerceMockSessionUserId;
            return {
              data: {
                session: userId ? {
                  access_token: 'mock-access-token',
                  token_type: 'bearer',
                  user: { id: String(userId), email: String(userId) + '@mock.invalid' }
                } : null
              },
              error: null
            };
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
          var filters = {};
          window.__alicerceMockTables.push(table);

          function rowsVisiveis() {
            if (table !== 'alicerce_data') return [];
            var sessionUserId = String(window.__alicerceMockSessionUserId || '');
            if (!sessionUserId) return [];
            return window.__alicerceMockCloudRows.filter(function (row) {
              if (!row || String(row.user_id || '') !== sessionUserId) return false;
              if (filters.user_id && String(row.user_id || '') !== String(filters.user_id)) return false;
              if (filters.store_name && String(row.store_name || '') !== String(filters.store_name)) return false;
              return true;
            }).map(function (row) {
              return JSON.parse(JSON.stringify(row));
            });
          }

          var query = {
            select: function () { return query; },
            eq: function (column, value) {
              filters[String(column)] = value;
              return query;
            },
            order: function () { return query; },
            limit: function (count) {
              return Promise.resolve({ data: rowsVisiveis().slice(0, Number(count) || rowsVisiveis().length), error: null });
            },
            maybeSingle: function () {
              var rows = rowsVisiveis();
              return Promise.resolve({ data: rows.length ? rows[0] : null, error: null });
            },
            upsert: async function (payload, options) {
              var row = payload || null;
              var sessionUserId = String(window.__alicerceMockSessionUserId || '');
              window.__alicerceMockUpserts.push({
                table: table,
                payload: row ? JSON.parse(JSON.stringify(row)) : null,
                options: options || null
              });
              if (window.__alicerceMockUpsertError) {
                return { data: null, error: { message: String(window.__alicerceMockUpsertError) } };
              }
              if (table === 'alicerce_data') {
                if (!sessionUserId || !row || String(row.user_id || '') !== sessionUserId) {
                  return { data: null, error: { message: 'row-level security policy violation' } };
                }
                var found = -1;
                for (var i = 0; i < window.__alicerceMockCloudRows.length; i++) {
                  var existing = window.__alicerceMockCloudRows[i];
                  if (existing && String(existing.user_id) === String(row.user_id) &&
                      String(existing.store_name) === String(row.store_name)) {
                    found = i;
                    break;
                  }
                }
                var copy = JSON.parse(JSON.stringify(row));
                if (found >= 0) window.__alicerceMockCloudRows[found] = copy;
                else window.__alicerceMockCloudRows.push(copy);
              }
              return { data: null, error: null };
            },
            then: function (resolve, reject) {
              var data = rowsVisiveis();
              return Promise.resolve({ data: data, error: null }).then(resolve, reject);
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
