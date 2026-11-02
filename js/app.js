/**
 * J2ME Retro Player Pro - Main Application Logic
 * PWA, Offline Support, Drag-and-Drop JAR Import & Fullscreen Landscape Management
 */

(function() {
  'use strict';

  // Global App State
  let deferredPrompt = null;
  let allInstalledGames = [];
  let isAutoplay = localStorage.getItem('j2me_autoplay') !== 'false'; // default true
  let selectedEngine = localStorage.getItem('j2me_engine') || 'enginemode1-classesold.jar';

  // DOM Elements
  const dropzone = document.getElementById('dropzone');
  const filePicker = document.getElementById('jar-file-input');
  const gameGrid = document.getElementById('game-grid');
  const emptyState = document.getElementById('empty-state');
  const gameCountBadge = document.getElementById('game-count-badge');
  const autoplayToggle = document.getElementById('autoplay-toggle');
  const btnInstallPwa = document.getElementById('btn-install-pwa');
  const btnSampleGame = document.getElementById('btn-sample-game');
  const gameModal = document.getElementById('game-modal');
  const gameIframe = document.getElementById('game-iframe');
  const settingsModal = document.getElementById('settings-modal');
  const engineSelect = document.getElementById('engine-mode-select');

  // Initialize
  function init() {
    registerServiceWorker();
    setupPwaInstall();
    setupDropzone();
    setupPreferences();
    setupSettingsModal();
    setupGameModalListener();

    // Check IndexedDB and load games
    loadLibrary();

    // Check if BounceTales should be pre-installed on first visit
    checkPreinstalledSample();
  }

  // 1. PWA Service Worker Registration
  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then((reg) => {
            console.log('[PWA] Service Worker registered successfully with scope:', reg.scope);
          })
          .catch((err) => {
            console.warn('[PWA] Service Worker registration failed:', err);
          });
      });
    }
  }

  // 2. PWA Add to Home Screen Handling
  function setupPwaInstall() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      if (btnInstallPwa) {
        btnInstallPwa.style.display = 'inline-flex';
      }
    });

    if (btnInstallPwa) {
      btnInstallPwa.addEventListener('click', async () => {
        if (deferredPrompt) {
          deferredPrompt.prompt();
          const { outcome } = await deferredPrompt.userChoice;
          console.log('[PWA] User response to install:', outcome);
          deferredPrompt = null;
          btnInstallPwa.style.display = 'none';
        } else {
          // If iOS Safari or browser without prompt support
          showToast('📱 Để cài đặt trên iPhone/iPad: Nhấn nút Chia Sẻ ⎋ dưới Safari -> "Thêm vào MH chính"');
        }
      });
    }

    // Hide if already running in standalone PWA mode
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
      if (btnInstallPwa) btnInstallPwa.style.display = 'none';
    }
  }

  // 3. Drag & Drop File Importer
  function setupDropzone() {
    if (!dropzone || !filePicker) return;

    // Click to open file picker
    dropzone.addEventListener('click', () => {
      filePicker.click();
    });

    filePicker.addEventListener('change', (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) {
        handleFiles(files);
      }
      filePicker.value = '';
    });

    // Drag-and-drop feedback
    ['dragenter', 'dragover'].forEach(name => {
      dropzone.addEventListener(name, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add('drag-over');
      });
    });

    ['dragleave', 'drop'].forEach(name => {
      dropzone.addEventListener(name, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('drag-over');
      });
    });

    // Handle Drop
    dropzone.addEventListener('drop', (e) => {
      const files = Array.from(e.dataTransfer.files || []);
      const jarFiles = files.filter(f => f.name.toLowerCase().endsWith('.jar'));
      if (jarFiles.length > 0) {
        handleFiles(jarFiles);
      } else {
        showToast('⚠️ Vui lòng chỉ kéo thả file có định dạng .jar!');
      }
    });

    // Whole window drag prevention
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => e.preventDefault());
  }

  // 4. Handle Imported Files
  async function handleFiles(files) {
    const jarFiles = files.filter(f => f.name.toLowerCase().endsWith('.jar'));
    if (jarFiles.length === 0) {
      showToast('⚠️ Vui lòng chọn file game định dạng .jar!');
      return;
    }

    showToast(`⏳ Đang xử lý ${jarFiles.length} file game...`);

    let lastImportedName = null;

    for (const file of jarFiles) {
      try {
        const buffer = await readFileAsArrayBuffer(file);
        await JARStore.installJAR(file.name, buffer);
        lastImportedName = file.name;
        console.log(`[JARStore] Installed ${file.name} successfully.`);
      } catch (err) {
        console.error('Lỗi khi cài đặt JAR:', file.name, err);
        showToast(`❌ Không thể cài đặt ${file.name}: ${err}`);
      }
    }

    // Refresh library UI
    await loadLibrary();

    if (lastImportedName) {
      if (isAutoplay) {
        showToast(`🎮 Khởi động ngay ${lastImportedName}...`);
        launchGame(lastImportedName);
      } else {
        showToast(`✅ Đã cài đặt thành công ${jarFiles.length} game vào máy!`);
      }
    }
  }

  function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(e);
      reader.readAsArrayBuffer(file);
    });
  }

  // 5. Load and Render Library from IndexedDB
  async function loadLibrary() {
    try {
      if (typeof JARStore === 'undefined') {
        console.warn('JARStore not ready yet, retrying...');
        setTimeout(loadLibrary, 250);
        return;
      }

      const files = await JARStore.getAll();
      allInstalledGames = files || [];

      renderGameList();
    } catch (err) {
      console.error('Lỗi tải danh sách game:', err);
    }
  }

  function renderGameList() {
    if (!gameGrid || !emptyState) return;

    if (gameCountBadge) {
      gameCountBadge.textContent = allInstalledGames.length.toString();
    }

    if (allInstalledGames.length === 0) {
      gameGrid.innerHTML = '';
      emptyState.style.display = 'block';
      return;
    }

    emptyState.style.display = 'none';

    let html = '';
    allInstalledGames.forEach((item) => {
      const meta = extractJarMetadata(item);
      const safeName = escapeHtml(item.jarName);
      const safeTitle = escapeHtml(meta.title || item.jarName.replace(/\.jar$/i, ''));
      const safeVendor = escapeHtml(meta.vendor || 'Java ME');
      const iconUrl = meta.iconUrl || './img/bounce.png';

      html += `
        <article class="game-card" data-jar="${safeName}">
          <div class="game-card-header">
            <img class="game-thumb" src="${iconUrl}" alt="${safeTitle}" onerror="this.src='./img/icon-192.png'">
            <div class="game-meta">
              <h3 class="game-name" title="${safeTitle}">${safeTitle}</h3>
              <div class="game-tags">
                <span class="tag-vendor">${safeVendor}</span>
                <span class="tag-size">.JAR</span>
              </div>
            </div>
          </div>
          <div class="game-card-actions">
            <button class="btn-play-game" onclick="window.J2MEApp.launchGame('${safeName}')">
              <span>▶</span> <span>CHƠI NGAY (FULL NGANG)</span>
            </button>
            <button class="btn-delete-game" title="Xóa game khỏi máy" onclick="window.J2MEApp.deleteGame('${safeName}')">
              ✕
            </button>
          </div>
        </article>
      `;
    });

    gameGrid.innerHTML = html;
  }

  // Extract Manifest & Icon from ZIP Directory Entry
  function extractJarMetadata(item) {
    const meta = {
      title: item.jarName.replace(/\.jar$/i, ''),
      vendor: 'Java ME',
      version: '1.0',
      iconUrl: null
    };

    if (!item.jar) return meta;

    try {
      // 1. Read MANIFEST.MF
      const mfEntry = item.jar['META-INF/MANIFEST.MF'];
      if (mfEntry) {
        let rawData = null;
        if (mfEntry.compression_method === 0) {
          rawData = mfEntry.compressed_data;
        } else if (mfEntry.compression_method === 8 && typeof inflate === 'function') {
          rawData = inflate(mfEntry.compressed_data, mfEntry.uncompressed_len);
        }

        if (rawData) {
          const text = new TextDecoder('utf-8').decode(rawData);
          const lines = text.replace(/\r\n|\r/g, '\n').replace(/\n /g, '').split('\n');
          let iconPath = null;

          lines.forEach(line => {
            const idx = line.indexOf(':');
            if (idx > -1) {
              const k = line.substring(0, idx).trim().toLowerCase();
              const v = line.substring(idx + 1).trim();
              if (k === 'midlet-name') meta.title = v;
              if (k === 'midlet-vendor') meta.vendor = v;
              if (k === 'midlet-version') meta.version = v;
              if (k === 'midlet-icon') iconPath = v;
              if (k === 'midlet-1' && !iconPath) {
                // MIDlet-1: Name, /icon.png, class
                const parts = v.split(',');
                if (parts[1]) iconPath = parts[1].trim();
              }
            }
          });

          // 2. Extract Icon Image
          if (iconPath) {
            const cleanPath = iconPath.replace(/^\//, '');
            const iconEntry = item.jar[cleanPath] || item.jar[iconPath];
            if (iconEntry) {
              let iconBytes = null;
              if (iconEntry.compression_method === 0) {
                iconBytes = iconEntry.compressed_data;
              } else if (iconEntry.compression_method === 8 && typeof inflate === 'function') {
                iconBytes = inflate(iconEntry.compressed_data, iconEntry.uncompressed_len);
              }

              if (iconBytes) {
                const blob = new Blob([iconBytes], { type: 'image/png' });
                meta.iconUrl = URL.createObjectURL(blob);
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn('Metadata parsing error for:', item.jarName, e);
    }

    return meta;
  }

  // 6. Launch Game in Fullscreen Landscape Modal
  async function launchGame(jarName) {
    if (!jarName) return;

    // Try requesting fullscreen directly in this user-gesture click handler!
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      } else if (document.documentElement.webkitRequestFullscreen) {
        await document.documentElement.webkitRequestFullscreen();
      }
    } catch (err) {
      console.log('Fullscreen request bypassed/fallback:', err);
    }

    // Try locking orientation to landscape
    if (screen.orientation && screen.orientation.lock) {
      try {
        await screen.orientation.lock('landscape');
      } catch (err) {
        console.log('Orientation lock not supported or bypassed:', err);
      }
    }

    // Build player URL
    const playerUrl = `main.html?localjar=${encodeURIComponent(jarName)}&enginemode=${encodeURIComponent(selectedEngine)}`;

    // Show Fullscreen Game Modal
    if (gameModal && gameIframe) {
      gameIframe.src = playerUrl;
      gameModal.classList.remove('hidden');
    } else {
      // Fallback navigation
      window.location.href = playerUrl;
    }
  }

  // Close Game Modal and Return to Library
  function closeGameModal() {
    if (gameModal && gameIframe) {
      gameModal.classList.add('hidden');
      gameIframe.src = 'about:blank';
    }

    // Exit fullscreen
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      try {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      } catch (e) {}
    }

    // Unlock orientation
    if (screen.orientation && screen.orientation.unlock) {
      try {
        screen.orientation.unlock();
      } catch (e) {}
    }

    // Refresh library in case save data changed
    loadLibrary();
  }

  // Listen to messages from player iframe
  function setupGameModalListener() {
    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'J2ME_EXIT') {
        closeGameModal();
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && gameModal && !gameModal.classList.contains('hidden')) {
        closeGameModal();
      }
    });
  }

  // Delete Game
  async function deleteGame(jarName) {
    if (!confirm(`Bạn có chắc chắn muốn xóa game "${jarName}" khỏi thư viện máy?`)) {
      return;
    }

    try {
      await JARStore.deleteJar(jarName);
      showToast(`🗑 Đã xóa "${jarName}" thành công!`);
      loadLibrary();
    } catch (err) {
      console.error('Lỗi khi xóa:', err);
      showToast(`❌ Không thể xóa ${jarName}`);
    }
  }

  // Pre-installed Sample Game (Bounce Tales & others)
  async function checkPreinstalledSample() {
    // If first run and no games installed, auto-install Bounce Tales
    setTimeout(async () => {
      if (typeof JARStore !== 'undefined') {
        const files = await JARStore.getAll();
        if (!files || files.length === 0) {
          installSample('BounceTales.jar', false);
        }
      }
    }, 600);
  }

  async function installSample(jarName = 'BounceTales.jar', autoLaunch = true) {
    showToast(`⏳ Đang cài đặt ${jarName}...`);
    try {
      const response = await fetch(`./jar/${jarName}`);
      if (!response.ok) throw new Error('Không thể tải file mẫu');
      const buffer = await response.arrayBuffer();
      await JARStore.installJAR(jarName, buffer);
      await loadLibrary();
      showToast(`✅ Đã cài đặt xong ${jarName}!`);
      if (autoLaunch) {
        launchGame(jarName);
      }
    } catch (err) {
      console.warn('Lỗi cài game mẫu:', err);
      showToast('⚠️ Không thể tải game mẫu offline.');
    }
  }

  // Preferences (Autoplay)
  function setupPreferences() {
    if (autoplayToggle) {
      autoplayToggle.checked = isAutoplay;
      autoplayToggle.addEventListener('change', () => {
        isAutoplay = autoplayToggle.checked;
        localStorage.setItem('j2me_autoplay', isAutoplay.toString());
        showToast(isAutoplay ? '⚡ Đã bật: Tự động chơi full ngang khi import' : '⏸ Đã tắt tự động chơi');
      });
    }
  }

  // Settings Modal
  function setupSettingsModal() {
    const btnSettings = document.getElementById('btn-open-settings');
    const btnCloseSettings = document.getElementById('btn-close-settings');
    const btnClearAll = document.getElementById('btn-clear-all-games');

    if (engineSelect) {
      engineSelect.value = selectedEngine;
      engineSelect.addEventListener('change', () => {
        selectedEngine = engineSelect.value;
        localStorage.setItem('j2me_engine', selectedEngine);
        showToast('⚙ Đã lưu thiết lập Engine');
      });
    }

    if (btnSettings && settingsModal) {
      btnSettings.addEventListener('click', () => {
        settingsModal.classList.add('show');
      });
    }

    if (btnCloseSettings && settingsModal) {
      btnCloseSettings.addEventListener('click', () => {
        settingsModal.classList.remove('show');
      });
      settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) settingsModal.classList.remove('show');
      });
    }

    if (btnClearAll) {
      btnClearAll.addEventListener('click', async () => {
        if (confirm('CẢNH BÁO: Thao tác này sẽ xóa toàn bộ game và save data trong trình duyệt! Bạn chắc chứ?')) {
          for (const item of allInstalledGames) {
            await JARStore.deleteJar(item.jarName);
          }
          showToast('🗑 Đã dọn sạch thư viện game!');
          loadLibrary();
          if (settingsModal) settingsModal.classList.remove('show');
        }
      });
    }
  }

  // Toast Notification
  function showToast(message) {
    let toast = document.getElementById('app-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'app-toast';
      toast.className = 'app-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;');
  }

  // Expose global methods for inline HTML onclick handlers
  window.J2MEApp = {
    launchGame,
    deleteGame,
    closeGameModal,
    installSample
  };

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
