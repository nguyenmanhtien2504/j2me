/**
 * J2ME Player Pro - Landscape Controller & UX Manager
 */

(function() {
  'use strict';

  // State
  let isLandscapeForced = false;
  let isMuted = false;
  let padOpacity = parseFloat(localStorage.getItem('j2me_pad_opacity') || '0.85');
  let activeKeys = new Set();
  let lastTouchPoints = new Map();

  // Wait for MIDP to be ready
  function sendKey(code, isPress) {
    if (typeof MIDP === 'undefined') return;
    try {
      if (isPress) {
        MIDP.sendKeyPress(code);
        if (navigator.vibrate && !activeKeys.has(code)) {
          navigator.vibrate(12);
        }
        activeKeys.add(code);
      } else {
        MIDP.sendKeyRelease(code);
        activeKeys.delete(code);
      }
    } catch (e) {
      console.warn('sendKey error:', e);
    }
  }

  // Key codes mapping
  const KEY_CODES = {
    'up': -1,
    'down': -2,
    'left': -3,
    'right': -4,
    'ok': -5,
    'fire': -5,
    'soft-left': -6,
    'choice': -6,
    'soft-right': -7,
    'back': -7,
    'call': -10,
    'end': -11,
    'num1': 49,
    'num2': 50,
    'num3': 51,
    'num4': 52,
    'num5': 53,
    'num6': 54,
    'num7': 55,
    'num8': 56,
    'num9': 57,
    'num0': 48,
    'star': 42,
    'pound': 35
  };

  // Setup UI listeners
  function initControls() {
    const controlsContainer = document.getElementById('controls-overlay');
    if (!controlsContainer) return;

    // Apply stored opacity
    applyOpacity(padOpacity);

    // Bind touch & pointer events to all key buttons
    const buttons = document.querySelectorAll('.game-key, .dpad-btn, .numpad-key');
    buttons.forEach(btn => {
      const codeKey = btn.getAttribute('data-code');
      const code = KEY_CODES[codeKey];
      if (code === undefined) return;

      const handlePress = (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.classList.add('active');
        sendKey(code, true);
        unlockAudio();
      };

      const handleRelease = (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.classList.remove('active');
        sendKey(code, false);
      };

      btn.addEventListener('pointerdown', handlePress);
      btn.addEventListener('pointerup', handleRelease);
      btn.addEventListener('pointercancel', handleRelease);
      btn.addEventListener('pointerleave', handleRelease);
    });

    // Virtual D-Pad Touch Drag (Swipe to steer)
    setupDpadTouchArea();

    // Setup Top HUD Buttons
    setupTopHUD();

    // Physical Keyboard Listener
    setupKeyboardListeners();

    // Gamepad API Listener
    setupGamepadLoop();

    // Orientation helper
    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
  }

  // Continuous D-Pad Touch/Drag Handling
  function setupDpadTouchArea() {
    const dpad = document.getElementById('virtual-dpad');
    if (!dpad) return;

    let currentDir = null;

    function getDirectionFromPoint(clientX, clientY) {
      const rect = dpad.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = clientX - centerX;
      const dy = clientY - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Deadzone in the center (triggers OK/center)
      if (dist < rect.width * 0.16) {
        return 'center';
      }

      // Angle calculation
      const angle = Math.atan2(dy, dx) * (180 / Math.PI); // -180 to 180

      if (angle >= -45 && angle < 45) {
        return 'right';
      } else if (angle >= 45 && angle < 135) {
        return 'down';
      } else if (angle >= -135 && angle < -45) {
        return 'up';
      } else {
        return 'left';
      }
    }

    function highlightButton(dir) {
      dpad.querySelectorAll('.dpad-btn').forEach(b => b.classList.remove('active'));
      if (dir === 'up') dpad.querySelector('.dpad-up')?.classList.add('active');
      else if (dir === 'down') dpad.querySelector('.dpad-down')?.classList.add('active');
      else if (dir === 'left') dpad.querySelector('.dpad-left')?.classList.add('active');
      else if (dir === 'right') dpad.querySelector('.dpad-right')?.classList.add('active');
      else if (dir === 'center') dpad.querySelector('.dpad-center')?.classList.add('active');
    }

    dpad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      dpad.setPointerCapture(e.pointerId);
      const dir = getDirectionFromPoint(e.clientX, e.clientY);
      currentDir = dir;
      highlightButton(dir);
      if (dir === 'center') sendKey(KEY_CODES['ok'], true);
      else if (dir) sendKey(KEY_CODES[dir], true);
      unlockAudio();
    });

    dpad.addEventListener('pointermove', (e) => {
      if (!currentDir) return;
      e.preventDefault();
      const newDir = getDirectionFromPoint(e.clientX, e.clientY);
      if (newDir !== currentDir) {
        // Release previous
        if (currentDir === 'center') sendKey(KEY_CODES['ok'], false);
        else if (currentDir) sendKey(KEY_CODES[currentDir], false);

        // Press new
        currentDir = newDir;
        highlightButton(newDir);
        if (newDir === 'center') sendKey(KEY_CODES['ok'], true);
        else if (newDir) sendKey(KEY_CODES[newDir], true);
      }
    });

    const endDrag = (e) => {
      if (!currentDir) return;
      e.preventDefault();
      if (currentDir === 'center') sendKey(KEY_CODES['ok'], false);
      else if (currentDir) sendKey(KEY_CODES[currentDir], false);
      currentDir = null;
      highlightButton(null);
    };

    dpad.addEventListener('pointerup', endDrag);
    dpad.addEventListener('pointercancel', endDrag);
  }

  // Setup Top HUD Controls
  function setupTopHUD() {
    // Exit button
    document.getElementById('hud-btn-exit')?.addEventListener('click', () => {
      exitPlayer();
    });

    // Fullscreen button
    document.getElementById('hud-btn-fullscreen')?.addEventListener('click', () => {
      toggleFullscreen();
    });

    // Force Landscape Rotate button
    document.getElementById('hud-btn-rotate')?.addEventListener('click', () => {
      toggleLandscapeMode();
    });

    // Sound toggle
    document.getElementById('hud-btn-sound')?.addEventListener('click', () => {
      toggleSound();
    });

    // Numpad toggle
    document.getElementById('hud-btn-numpad')?.addEventListener('click', () => {
      toggleNumpad();
    });

    // Opacity toggle / slider
    document.getElementById('hud-btn-opacity')?.addEventListener('click', () => {
      cycleOpacity();
    });

    // Auto-enter fullscreen landscape on first click
    document.body.addEventListener('click', function autoFs() {
      document.body.removeEventListener('click', autoFs);
      unlockAudio();
      tryLockLandscape();
    }, { once: true });
  }

  // Physical Keyboard Handling
  function setupKeyboardListeners() {
    const keyMap = {
      'ArrowUp': KEY_CODES['up'],
      'KeyW': KEY_CODES['up'],
      'ArrowDown': KEY_CODES['down'],
      'KeyS': KEY_CODES['down'],
      'ArrowLeft': KEY_CODES['left'],
      'KeyA': KEY_CODES['left'],
      'ArrowRight': KEY_CODES['right'],
      'KeyD': KEY_CODES['right'],
      'Enter': KEY_CODES['ok'],
      'Space': KEY_CODES['ok'],
      'KeyJ': KEY_CODES['ok'],
      'KeyQ': KEY_CODES['soft-left'],
      'F1': KEY_CODES['soft-left'],
      'KeyE': KEY_CODES['soft-right'],
      'KeyK': KEY_CODES['soft-right'],
      'F2': KEY_CODES['soft-right'],
      'Digit1': KEY_CODES['num1'],
      'Numpad1': KEY_CODES['num1'],
      'Digit2': KEY_CODES['num2'],
      'Numpad2': KEY_CODES['num2'],
      'Digit3': KEY_CODES['num3'],
      'Numpad3': KEY_CODES['num3'],
      'Digit4': KEY_CODES['num4'],
      'Numpad4': KEY_CODES['num4'],
      'Digit5': KEY_CODES['num5'],
      'Numpad5': KEY_CODES['num5'],
      'Digit6': KEY_CODES['num6'],
      'Numpad6': KEY_CODES['num6'],
      'Digit7': KEY_CODES['num7'],
      'Numpad7': KEY_CODES['num7'],
      'Digit8': KEY_CODES['num8'],
      'Numpad8': KEY_CODES['num8'],
      'Digit9': KEY_CODES['num9'],
      'Numpad9': KEY_CODES['num9'],
      'Digit0': KEY_CODES['num0'],
      'Numpad0': KEY_CODES['num0'],
      'NumpadMultiply': KEY_CODES['star'],
      'NumpadDivide': KEY_CODES['pound']
    };

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        exitPlayer();
        return;
      }
      const code = keyMap[e.code];
      if (code !== undefined) {
        e.preventDefault();
        sendKey(code, true);
        unlockAudio();
      }
    });

    window.addEventListener('keyup', (e) => {
      const code = keyMap[e.code];
      if (code !== undefined) {
        e.preventDefault();
        sendKey(code, false);
      }
    });
  }

  // Gamepad Loop (Support Bluetooth / Xbox / PS Controllers)
  function setupGamepadLoop() {
    let prevButtonStates = {};

    function pollGamepad() {
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      const gp = gamepads[0];
      if (gp) {
        // D-Pad / Buttons
        const buttonActions = [
          { index: 0, code: KEY_CODES['ok'] },          // A
          { index: 1, code: KEY_CODES['soft-right'] },   // B
          { index: 2, code: KEY_CODES['ok'] },          // X
          { index: 3, code: KEY_CODES['soft-left'] },    // Y
          { index: 4, code: KEY_CODES['soft-left'] },    // L1
          { index: 5, code: KEY_CODES['soft-right'] },   // R1
          { index: 8, code: KEY_CODES['soft-left'] },    // Select
          { index: 9, code: KEY_CODES['ok'] },          // Start
          { index: 12, code: KEY_CODES['up'] },         // Dpad Up
          { index: 13, code: KEY_CODES['down'] },       // Dpad Down
          { index: 14, code: KEY_CODES['left'] },       // Dpad Left
          { index: 15, code: KEY_CODES['right'] }       // Dpad Right
        ];

        // Analog stick support (Left stick)
        if (gp.axes.length >= 2) {
          const axisX = gp.axes[0];
          const axisY = gp.axes[1];
          checkAxis(axisY < -0.5, KEY_CODES['up'], 'axis_up');
          checkAxis(axisY > 0.5, KEY_CODES['down'], 'axis_down');
          checkAxis(axisX < -0.5, KEY_CODES['left'], 'axis_left');
          checkAxis(axisX > 0.5, KEY_CODES['right'], 'axis_right');
        }

        buttonActions.forEach(({ index, code }) => {
          const isPressed = gp.buttons[index] && gp.buttons[index].pressed;
          const key = 'btn_' + index;
          if (isPressed && !prevButtonStates[key]) {
            sendKey(code, true);
          } else if (!isPressed && prevButtonStates[key]) {
            sendKey(code, false);
          }
          prevButtonStates[key] = isPressed;
        });
      }
      requestAnimationFrame(pollGamepad);
    }

    function checkAxis(isTriggered, code, key) {
      if (isTriggered && !prevButtonStates[key]) {
        sendKey(code, true);
      } else if (!isTriggered && prevButtonStates[key]) {
        sendKey(code, false);
      }
      prevButtonStates[key] = isTriggered;
    }

    window.addEventListener('gamepadconnected', () => {
      console.log('Gamepad connected!');
      showToast('🎮 Đã kết nối tay cầm Gamepad!');
    });

    requestAnimationFrame(pollGamepad);
  }

  // Fullscreen Management
  async function toggleFullscreen() {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      try {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        } else if (document.documentElement.webkitRequestFullscreen) {
          await document.documentElement.webkitRequestFullscreen();
        }
        tryLockLandscape();
      } catch (err) {
        console.warn('Fullscreen request denied:', err);
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    }
  }

  async function tryLockLandscape() {
    if (screen.orientation && screen.orientation.lock) {
      try {
        await screen.orientation.lock('landscape');
      } catch (e) {
        console.log('Orientation lock not supported or failed:', e);
      }
    }
  }

  // Force Landscape Rotation Mode (CSS 90deg transform)
  function toggleLandscapeMode() {
    isLandscapeForced = !isLandscapeForced;
    const viewport = document.getElementById('game-viewport');
    if (viewport) {
      viewport.classList.toggle('force-landscape', isLandscapeForced);
      showToast(isLandscapeForced ? '🔄 Đã bật chế độ xoay ngang giả lập' : '🔄 Chế độ xoay mặc định');
      setTimeout(triggerCanvasResize, 100);
    }
  }

  // Sound Toggle
  function toggleSound() {
    isMuted = !isMuted;
    const btn = document.getElementById('hud-btn-sound');
    if (window.WebAudioTinySynth && window.WebAudioTinySynth.masterVol !== undefined) {
      window.WebAudioTinySynth.masterVol = isMuted ? 0 : 0.8;
    }
    if (btn) {
      btn.innerHTML = isMuted ? '🔇' : '🔊';
      btn.title = isMuted ? 'Bật âm thanh' : 'Tắt âm thanh';
    }
    showToast(isMuted ? '🔇 Đã tắt âm thanh' : '🔊 Đã bật âm thanh');
  }

  // Unmute / unlock Web Audio Context
  function unlockAudio() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        const tempCtx = new AudioCtx();
        if (tempCtx.state === 'suspended') {
          tempCtx.resume();
        }
      }
    } catch (e) {}
  }

  // Numpad Toggle
  function toggleNumpad() {
    const numpad = document.getElementById('numpad-drawer');
    if (numpad) {
      numpad.classList.toggle('open');
    }
  }

  // Opacity Cycler
  function cycleOpacity() {
    const levels = [0.85, 0.5, 0.2, 1.0];
    const currentIndex = levels.indexOf(padOpacity);
    padOpacity = levels[(currentIndex + 1) % levels.length];
    localStorage.setItem('j2me_pad_opacity', padOpacity.toString());
    applyOpacity(padOpacity);
    showToast(`🎮 Độ mờ phím: ${Math.round(padOpacity * 100)}%`);
  }

  function applyOpacity(value) {
    document.documentElement.style.setProperty('--pad-opacity', value.toString());
  }

  // Orientation Check
  function checkOrientation() {
    const isPortrait = window.innerHeight > window.innerWidth;
    const helper = document.getElementById('portrait-warning');
    if (helper) {
      helper.style.display = (isPortrait && !isLandscapeForced) ? 'flex' : 'none';
    }
    triggerCanvasResize();
  }

  function triggerCanvasResize() {
    const canvas = document.getElementById('canvas');
    if (canvas) {
      try {
        canvas.dispatchEvent(new Event('canvasresize'));
      } catch (e) {}
    }
  }

  // Exit Game
  function exitPlayer() {
    // If in iframe, message parent
    if (window.parent && window.parent !== window) {
      try {
        if (window.parent.J2MEApp && window.parent.J2MEApp.closeGameModal) {
          window.parent.J2MEApp.closeGameModal();
          return;
        }
      } catch (e) {}
      window.parent.postMessage({ type: 'J2ME_EXIT' }, '*');
    } else {
      window.location.href = './index.html';
    }
  }

  // Simple Toast
  function showToast(msg) {
    let toast = document.getElementById('player-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'player-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.className = 'show';
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => {
      toast.className = '';
    }, 2200);
  }

  // Initialize on DOM load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initControls);
  } else {
    initControls();
  }

  // Expose global helpers
  window.J2MEPlayerControls = {
    sendKey,
    toggleFullscreen,
    toggleLandscapeMode,
    toggleSound,
    exitPlayer
  };
})();
