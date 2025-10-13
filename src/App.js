import React, { useEffect, useState } from 'react';
import CryptoJS from 'crypto-js'; // For AES encryption

function App() {
  const [tg, setTg] = useState(null);
  const [devMode, setDevMode] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [biometricToken, setBiometricToken] = useState('');
  const [assets, setAssets] = useState([]);
  const [newAsset, setNewAsset] = useState({ type: '', details: '', notes: '' });

  // Helper to show alerts using Telegram SDK when available, or window.alert when not
  const showAlert = (msg) => {
    if (tg && typeof tg.showAlert === 'function') return tg.showAlert(msg);
    return window.alert(msg);
  };

  // Create a simple fake Telegram WebApp for local dev mode so UI can be tested in a browser.
  const createFakeTelegram = () => {
    const handlers = {};
    const storageKey = 'dlv_assets';
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

  useEffect(() => {
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
        tg.close && tg.close();
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
    if (!tg) return;
    tg.SecureStorage.getItem('dlv_assets', (err, value) => {
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
    if (!tg) return;
    tg.SecureStorage.getItem('dlv_assets', (err, value) => {
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
    if (!tg) return showAlert('Telegram API not available');
    if (assets.length >= 10) { // Limit to 10
      return showAlert('Maximum 10 assets allowed');
    }
    const updatedAssets = [...assets, newAsset];
    const encrypted = encryptData(updatedAssets);
    tg.SecureStorage.setItem('dlv_assets', encrypted, (err, success) => {
      if (success) {
        setAssets(updatedAssets);
        setNewAsset({ type: '', details: '', notes: '' });
        tg.HapticFeedback && tg.HapticFeedback.notificationOccurred && tg.HapticFeedback.notificationOccurred('success');
        showAlert('Asset saved!');
      } else if (err) {
        console.error(err);
        showAlert('Failed to save asset');
      }
    });
  };

  // Delete asset
  const deleteAsset = (index) => {
    if (!tg) return showAlert('Telegram API not available');
    const updatedAssets = assets.filter((_, i) => i !== index);
    const encrypted = encryptData(updatedAssets);
    tg.SecureStorage.setItem('dlv_assets', encrypted, (err, success) => {
      if (success) {
        setAssets(updatedAssets);
        showAlert('Asset deleted!');
      } else if (err) {
        console.error(err);
        showAlert('Failed to delete asset');
      }
    });
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
      <h1>Lite Digital Legacy Vault</h1>
      <p>Store and retrieve asset info securely (no passwords/seed phrases).</p>
      {isAuthenticated ? (
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
          <button onClick={saveAsset} style={{ padding: '10px 20px', margin: '10px 0' }}>Add Asset</button>
          <h2>Your Assets</h2>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {assets.map((asset, i) => (
              <li key={i} style={{ margin: '10px 0', padding: '10px', border: '1px solid #ccc', borderRadius: '5px' }}>
                <strong>{asset.type}:</strong> {asset.details}
                {asset.notes && <p>Notes: {asset.notes}</p>}
                <button onClick={() => deleteAsset(i)} style={{ marginTop: '5px' }}>Delete</button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p>Authenticate with biometrics to access your vault.</p>
      )}
    </div>
  );
}

export default App;