import React, { useEffect, useState } from 'react';
import CryptoJS from 'crypto-js'; // For AES encryption

function App() {
  const [tg, setTg] = useState(null);
  const [devMode, setDevMode] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [biometricToken, setBiometricToken] = useState('');
  const [assets, setAssets] = useState([]);
  const [newAsset, setNewAsset] = useState({ type: '', details: '', notes: '' });
  const [editingIndex, setEditingIndex] = useState(-1);
  const [lastAction, setLastAction] = useState('');
  const [lastError, setLastError] = useState('');

  // Helper to show alerts using Telegram SDK when available, or window.alert when not
  const showAlert = (msg) => {
    // Try Telegram showAlert, but fall back to window.alert and swallow WebAppMethodUnsupported
    try {
      if (tg && typeof tg.showAlert === 'function') {
        try {
          tg.showAlert(msg);
          return;
        } catch (e) {
          console.warn('tg.showAlert failed, falling back to window.alert', e);
        }
      }
    } catch (e) {
      console.warn('showAlert wrapper unexpected error', e);
    }
    try { window.alert(msg); } catch (e) { console.error('window.alert failed', e); }
  };

  // Safe wrappers for SecureStorage (fallback to localStorage if SecureStorage is unsupported)
  const secureGetItem = (key, cb) => {
    try {
      if (tg && tg.SecureStorage && typeof tg.SecureStorage.getItem === 'function') {
        try {
          return tg.SecureStorage.getItem(key, cb);
        } catch (e) {
          console.warn('tg.SecureStorage.getItem threw, falling back to localStorage', e);
        }
      }
    } catch (e) {
      console.warn('secureGetItem unexpected error', e);
    }
    // async to mimic callback
    setTimeout(() => {
      try {
        const v = localStorage.getItem(key);
        cb(null, v);
      } catch (err) {
        cb(err);
      }
    }, 0);
  };

  const secureSetItem = (key, value, cb) => {
    try {
      if (tg && tg.SecureStorage && typeof tg.SecureStorage.setItem === 'function') {
        try {
          return tg.SecureStorage.setItem(key, value, cb);
        } catch (e) {
          console.warn('tg.SecureStorage.setItem threw, falling back to localStorage', e);
        }
      }
    } catch (e) {
      console.warn('secureSetItem unexpected error', e);
    }
    setTimeout(() => {
      try {
        localStorage.setItem(key, value);
        cb(null, true);
      } catch (err) {
        cb(err, false);
      }
    }, 0);
  };

  const safeHaptic = (type) => {
    try {
      tg && tg.HapticFeedback && typeof tg.HapticFeedback.notificationOccurred === 'function' && tg.HapticFeedback.notificationOccurred(type);
    } catch (e) {
      console.warn('HapticFeedback failed', e);
    }
  };

  const safeClose = () => {
    try { tg && typeof tg.close === 'function' && tg.close(); } catch (e) { console.warn('tg.close failed', e); }
  };

  // Create a simple fake Telegram WebApp for local dev mode so UI can be tested in a browser.
  const createFakeTelegram = () => {
    const handlers = {};
    return {
      themeParams: { bg_color: '#ffffff', text_color: '#000000' },
      ready: () => {},
      expand: () => {},
      onEvent: (name, cb) => {
        handlers[name] = cb;
      },
      triggerEvent: (name, payload) => {
        if (handlers[name]) handlers[name](payload);
      },
      showAlert: (text) => window.alert(text),
      close: () => {},
      HapticFeedback: { notificationOccurred: (t) => console.log('haptic', t) },
      SecureStorage: {
        getItem: (key, cb) => {
          try {
            const v = localStorage.getItem(key);
            cb(null, v);
          } catch (e) {
            cb(e);
          }
        },
        setItem: (key, value, cb) => {
          try {
            localStorage.setItem(key, value);
            cb(null, true);
          } catch (e) {
            cb(e, false);
          }
        },
      },
      BiometricManager: {
        isBiometricAvailable: true,
        isAccessGranted: false,
        init: (cb) => cb && cb(),
        requestAccess: (opts, cb) => {
          // Simulate user granting access in dev mode
          setTimeout(() => cb && cb(true), 200);
        },
        authenticate: (opts) => {
          // Simulate authentication success
          setTimeout(() => {
            const token = 'dev-biometric-token';
            setIsAuthenticated(true);
            setBiometricToken(token);
            loadAssetsWithToken(token);
          }, 200);
        },
      },
    };
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    // If URL contains ?dev=1 enable devMode automatically (useful on deployed preview)
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('dev') === '1') setDevMode(true);
    } catch (e) {
      // ignore
    }

    const telegram = window.Telegram?.WebApp;
    if (telegram) {
      setTg(telegram);
      telegram.ready(); // Hide loading spinner
      telegram.expand(); // Full height
      // Theme adaptation
      document.body.style.backgroundColor = telegram.themeParams.bg_color;
      telegram.onEvent('themeChanged', () => {
        document.body.style.backgroundColor = telegram.themeParams.bg_color;
      });

      // Validate initData (send to backend for HMAC check)
      validateInitData(telegram.initData);

      // Biometric setup
      const biometric = telegram.BiometricManager;
      biometric.init(() => {
        if (biometric.isBiometricAvailable && !biometric.isAccessGranted) {
          biometric.requestAccess({ reason: 'Secure your asset vault' }, (granted) => {
            if (granted) {
              authenticateBiometrics();
            }
          });
        } else if (biometric.isAccessGranted) {
          authenticateBiometrics();
        }
      });

      telegram.onEvent('biometricAuthRequested', (event) => {
        setIsAuthenticated(event.isAuthenticated);
        if (event.isAuthenticated) {
          setBiometricToken(event.biometricToken);
          // Load assets after auth
          loadAssets();
        }
      });
    }
  }, []);

  // When devMode is toggled on in a regular browser, create fake Telegram object
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (devMode && !tg) {
      const fake = createFakeTelegram();
      setTg(fake);
      // simulate immediate auth in dev mode for convenience
      const token = 'dev-biometric-token';
      setIsAuthenticated(true);
      setBiometricToken(token);
      // load assets from localStorage
      loadAssetsWithToken(token);
    }
  }, [devMode]);

  // Backend validation function (call your Vercel API)
  const validateInitData = async (initData) => {
    if (!tg) return; // Guard for local testing
    try {
      const response = await fetch('/api/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData }),
      });
      const { valid } = await response.json();
      if (!valid) {
        showAlert('Invalid session! Please restart.');
        safeClose();
      }
    } catch (error) {
      console.error('Validation failed', error);
      showAlert('Error validating session.');
    }
  };

  // Function to authenticate
  const authenticateBiometrics = () => {
    tg?.BiometricManager?.authenticate({ reason: 'Unlock your vault' });
  };

  // Encryption function
  const encryptData = (data, key = biometricToken) => {
    return CryptoJS.AES.encrypt(JSON.stringify(data), key).toString();
  };

  // Decryption
  const decryptData = (encrypted, key = biometricToken) => {
    const bytes = CryptoJS.AES.decrypt(encrypted, key);
    return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
  };

  // Load assets from SecureStorage using current biometric key
  const loadAssets = () => {
    secureGetItem('dlv_assets', (err, value) => {
      if (!err && value) {
        try {
          const decrypted = decryptData(value);
          setAssets(decrypted);
        } catch (e) {
          showAlert('Error loading assets');
        }
      }
    });
  };

  // Helper to load assets with a specific token (used in dev mode)
  const loadAssetsWithToken = (token) => {
    secureGetItem('dlv_assets', (err, value) => {
      if (!err && value) {
        try {
          const decrypted = decryptData(value, token);
          setAssets(decrypted);
        } catch (e) {
          showAlert('Error loading assets');
        }
      }
    });
  };

  // Save assets
  const saveAsset = () => {
    setLastError('');
    setLastAction('saveAsset');
    if (!tg) {
      setLastError('Telegram API not available');
      return showAlert('Telegram API not available');
    }
    if (assets.length >= 10) { // Limit to 10
      setLastError('Maximum assets reached');
      return showAlert('Maximum 10 assets allowed');
    }
    if (editingIndex >= 0) {
      // save edit
      const updatedAssets = assets.map((a, i) => i === editingIndex ? newAsset : a);
      setEditingIndex(-1);
      try {
        setAssets(updatedAssets);
        setNewAsset({ type: '', details: '', notes: '' });
        const encrypted = encryptData(updatedAssets);
        secureSetItem('dlv_assets', encrypted, (err, success) => {
          if (err || !success) {
            console.error('SecureStorage.setItem failed', err);
            setLastError(err ? String(err) : 'setItem returned false');
            setAssets(assets);
            showAlert('Failed to save asset');
          } else {
            safeHaptic('success');
            showAlert('Asset saved!');
          }
        });
      } catch (ex) {
        console.error('saveAsset (edit) exception', ex);
        setLastError(String(ex));
        setAssets(assets);
        showAlert('Failed to save asset (exception)');
      }
      return;
    }
    const updatedAssets = [...assets, newAsset];
    // optimistic update so UI is responsive
    try {
      setAssets(updatedAssets);
      setNewAsset({ type: '', details: '', notes: '' });
      const encrypted = encryptData(updatedAssets);
      secureSetItem('dlv_assets', encrypted, (err, success) => {
        if (err || !success) {
          console.error('SecureStorage.setItem failed', err);
          setLastError(err ? String(err) : 'setItem returned false');
          // revert optimistic update
          setAssets(assets);
          showAlert('Failed to save asset');
        } else {
          safeHaptic('success');
          showAlert('Asset saved!');
        }
      });
    } catch (ex) {
      console.error('saveAsset exception', ex);
      setLastError(String(ex));
      setAssets(assets);
      showAlert('Failed to save asset (exception)');
    }
  };

  // Delete asset
  const deleteAsset = (index) => {
    setLastError('');
    setLastAction('deleteAsset');
    if (!tg) {
      setLastError('Telegram API not available');
      return showAlert('Telegram API not available');
    }
    const updatedAssets = assets.filter((_, i) => i !== index);
    try {
      // optimistic
      const prior = assets;
      setAssets(updatedAssets);
      const encrypted = encryptData(updatedAssets);
      secureSetItem('dlv_assets', encrypted, (err, success) => {
        if (err || !success) {
          console.error('SecureStorage.setItem failed', err);
          setLastError(err ? String(err) : 'setItem returned false');
          // revert
          setAssets(prior);
          showAlert('Failed to delete asset');
        } else {
          showAlert('Asset deleted!');
        }
      });
    } catch (ex) {
      console.error('deleteAsset exception', ex);
      setLastError(String(ex));
      showAlert('Failed to delete asset (exception)');
    }
  };

  const startEdit = (index) => {
    setEditingIndex(index);
    setNewAsset(assets[index]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingIndex(-1);
    setNewAsset({ type: '', details: '', notes: '' });
  };

  // If Telegram is not available, show a small UI to enable dev mode for local testing
  if (!tg) {
    return (
      <div style={{ padding: 20 }}>
        <h1>Lite Digital Legacy Vault</h1>
        <p>Your app is not running inside Telegram. To test the UI in this browser, enable Dev Mode below.</p>
        <label style={{ display: 'block', marginBottom: 10 }}>
          <input type="checkbox" checked={devMode} onChange={(e) => setDevMode(e.target.checked)} /> Enable Dev Mode
        </label>
        <p style={{ color: '#666' }}>
          Dev Mode uses localStorage (encrypted with a temporary dev token) to simulate Telegram SecureStorage and biometrics.
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', color: tg.themeParams.text_color, backgroundColor: tg.themeParams.bg_color }}>
      {devMode && (
        <div style={{ background: '#fff3bf', color: '#664d03', padding: '8px 12px', borderRadius: 6, marginBottom: 12, border: '1px solid #ffe58f' }}>
          <strong>Dev Mode</strong> — running with a simulated Telegram API. Data is stored in localStorage.
          <button onClick={() => setDevMode(false)} style={{ float: 'right', background: 'transparent', border: 'none', cursor: 'pointer' }}>Dismiss</button>
        </div>
      )}
      {devMode && (
        <div style={{ background: '#f6f8fa', border: '1px solid #e1e4e8', padding: 12, borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>Debug</strong>
            <div>
              <button onClick={() => {
                // simulate biometric auth in dev mode
                const token = 'dev-biometric-token';
                setIsAuthenticated(true);
                setBiometricToken(token);
                loadAssetsWithToken(token);
              }} style={{ marginRight: 8 }}>Simulate Auth</button>
            </div>
          </div>
          <pre style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>
{JSON.stringify({ devMode: !!devMode, tg: !!tg, isAuthenticated, biometricToken: biometricToken ? '[redacted]' : '', assetsLength: assets.length, lastAction, lastError }, null, 2)}
          </pre>
        </div>
      )}
      <h1>Lite Digital Legacy Vault</h1>
      <p>Store and retrieve asset info securely (no passwords/seed phrases).</p>
  {(isAuthenticated || devMode) ? (
        <>
          <h2>Add New Asset</h2>
          <select value={newAsset.type} onChange={(e) => setNewAsset({ ...newAsset, type: e.target.value })}>
            <option value="">Asset Type</option>
            <option value="crypto">Crypto</option>
            <option value="domain">Domain</option>
            <option value="other">Other</option>
          </select>
          <input
            value={newAsset.details}
            onChange={(e) => setNewAsset({ ...newAsset, details: e.target.value })}
            placeholder="Details (e.g., wallet address)"
            style={{ width: '100%', margin: '10px 0', padding: '8px' }}
          />
          <textarea
            value={newAsset.notes}
            onChange={(e) => setNewAsset({ ...newAsset, notes: e.target.value })}
            placeholder="Notes"
            style={{ width: '100%', margin: '10px 0', padding: '8px' }}
          />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={saveAsset} style={{ padding: '10px 20px', margin: '10px 0' }}>{editingIndex >= 0 ? 'Save Changes' : 'Add Asset'}</button>
            {editingIndex >= 0 && <button onClick={cancelEdit} style={{ padding: '10px 20px', margin: '10px 0' }}>Cancel</button>}
          </div>
          <h2>Your Assets</h2>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {assets.map((asset, i) => (
              <li key={i} style={{ margin: '10px 0', padding: '10px', border: '1px solid #ccc', borderRadius: '5px' }}>
                <strong>{asset.type}:</strong> {asset.details}
                {asset.notes && <p>Notes: {asset.notes}</p>}
                <div style={{ marginTop: '5px', display: 'flex', gap: 8 }}>
                  <button onClick={() => startEdit(i)}>Edit</button>
                  <button onClick={() => deleteAsset(i)}>Delete</button>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div>
          <p>Authenticate with biometrics to access your vault.</p>
          <div style={{ marginTop: 8 }}>
            <button onClick={() => {
              try {
                // If BiometricManager exists, ensure access is requested first when needed
                if (tg?.BiometricManager) {
                  const bm = tg.BiometricManager;
                  if (!bm.isAccessGranted && typeof bm.requestAccess === 'function') {
                    bm.requestAccess({ reason: 'Unlock your vault' }, (granted) => {
                      if (granted) {
                        authenticateBiometrics();
                      } else {
                        showAlert('Biometric access was not granted.');
                      }
                    });
                    return;
                  }
                  // Otherwise call authenticate directly
                  authenticateBiometrics();
                  return;
                }
                showAlert('Biometric auth not available in this Telegram client. Try updating Telegram or enable Dev Mode to test.');
              } catch (e) {
                console.error('Authenticate button error', e);
                showAlert('Failed to start biometric authentication.');
              }
            }}>Authenticate</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;