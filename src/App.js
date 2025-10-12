import React, { useEffect, useState } from 'react';
import CryptoJS from 'crypto-js'; // For AES encryption

function App() {
  const [tg, setTg] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [biometricToken, setBiometricToken] = useState('');
  const [assets, setAssets] = useState([]);
  const [newAsset, setNewAsset] = useState({ type: '', details: '', notes: '' });

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

  // Backend validation function (call your Vercel API)
  const validateInitData = async (initData) => {
    try {
      const response = await fetch('/api/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData }),
      });
      const { valid } = await response.json();
      if (!valid) {
        tg.showAlert('Invalid session! Please restart.');
        tg.close();
      }
    } catch (error) {
      console.error('Validation failed', error);
      tg.showAlert('Error validating session.');
    }
  };

  // Function to authenticate
  const authenticateBiometrics = () => {
    tg.BiometricManager.authenticate({ reason: 'Unlock your vault' });
  };

  // Encryption function
  const encryptData = (data) => {
    return CryptoJS.AES.encrypt(JSON.stringify(data), biometricToken).toString();
  };

  // Decryption
  const decryptData = (encrypted) => {
    const bytes = CryptoJS.AES.decrypt(encrypted, biometricToken);
    return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
  };

  // Load assets from SecureStorage
  const loadAssets = () => {
    tg.SecureStorage.getItem('dlv_assets', (err, value) => {
      if (!err && value) {
        try {
          const decrypted = decryptData(value);
          setAssets(decrypted);
        } catch (e) {
          tg.showAlert('Error loading assets');
        }
      }
    });
  };

  // Save assets
  const saveAsset = () => {
    if (assets.length >= 10) { // Limit to 10
      tg.showAlert('Maximum 10 assets allowed');
      return;
    }
    const updatedAssets = [...assets, newAsset];
    const encrypted = encryptData(updatedAssets);
    tg.SecureStorage.setItem('dlv_assets', encrypted, (err, success) => {
      if (success) {
        setAssets(updatedAssets);
        setNewAsset({ type: '', details: '', notes: '' });
        tg.HapticFeedback.notificationOccurred('success');
        tg.showAlert('Asset saved!');
      }
    });
  };

  // Delete asset
  const deleteAsset = (index) => {
    const updatedAssets = assets.filter((_, i) => i !== index);
    const encrypted = encryptData(updatedAssets);
    tg.SecureStorage.setItem('dlv_assets', encrypted, (err, success) => {
      if (success) {
        setAssets(updatedAssets);
        tg.showAlert('Asset deleted!');
      }
    });
  };

  if (!tg) return <div>Loading Mini App...</div>;

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