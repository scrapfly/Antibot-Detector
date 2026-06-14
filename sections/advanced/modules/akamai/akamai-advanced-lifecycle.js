
    /**
     * Update capture button state
     * Override from BaseAdvancedModule to add custom styling
     */
AkamaiAdvanced.prototype.updateCaptureButtonState = function(isCapturing) {
        const btn = document.querySelector('#akamaiStartCapture');
        if (!btn) return;

        const label = btn.querySelector('.tool-btn-label');
        if (!label) return;

        const tr = (key, fallback) => (
            typeof I18n !== 'undefined' ? I18n.tr(key, fallback) : fallback
        );
        if (isCapturing) {
            label.textContent = tr('btnStopCapturing', 'Stop Capturing');
            btn.style.background = 'var(--danger)';
        } else {
            label.textContent = tr('btnStartCapturing', 'Start Capturing');
            btn.style.background = '';
        }
    };

    /**
     * Start capturing Akamai data
     */
    // ========================================================================
    // CAPTURE HOOKS - Override from BaseAdvancedModule
    // ========================================================================



    /**
     * Hook: Validate Akamai presence and prepare for capture
     * Override from BaseAdvancedModule
     */
AkamaiAdvanced.prototype.beforeCapture = async function() {
        // Validate tab info
        if (!this.tabInfo || !this.tabInfo.id) {
            throw new Error('Tab information not available');
        }

        // Check for Akamai cookies to ensure Akamai is present
        Logger.network('[Akamai] Checking for Akamai cookies before starting capture...');
        const cookies = await chrome.cookies.getAll({ url: this.tabInfo.url });

        const abckCookie = cookies.find(c => c.name === '_abck');
        const bmSzCookie = cookies.find(c => c.name === 'bm_sz');
        const akBmscCookie = cookies.find(c => c.name === 'ak_bmsc');

        // Must have _abck cookie to proceed
        if (!abckCookie) {
            Logger.network('[Akamai] No _abck cookie found - Akamai not detected on this page');

            // Show error notifications
            NotificationHelper.error('No Akamai detected on this page. The _abck cookie is not present.');

            // Show error notification using standard pattern
            await chrome.scripting.executeScript({
                target: { tabId: this.tabInfo.id },
                func: () => {
                    // Cleanup old notifications
                    const allNotifs = document.querySelectorAll('[id^="scrapfly-capture-notification"]');
                    allNotifs.forEach(n => n.remove());
                    const oldStyles = document.querySelectorAll('style[data-scrapfly-notification]');
                    oldStyles.forEach(s => s.remove());

                    const notif = document.createElement('div');
                    notif.id = `scrapfly-capture-notification-${Date.now()}`;
                    notif.style.cssText = `
                        position: fixed !important; top: 20px !important; right: 20px !important;
                        background: linear-gradient(135deg, #eb3349 0%, #f45c43 100%) !important;
                        color: white !important; padding: 20px 24px !important; border-radius: 12px !important;
                        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3) !important; z-index: 2147483647 !important;
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
                        min-width: 320px !important;
                    `;

                    const styleTag = document.createElement('style');
                    styleTag.setAttribute('data-scrapfly-notification', 'true');
                    styleTag.textContent = `
                        @keyframes slideIn { from { transform: translateX(400px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
                        @keyframes slideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(400px); opacity: 0; } }
                    `;
                    document.head.appendChild(styleTag);

                    notif.innerHTML = `
                        <div style="font-weight: 600; font-size: 16px; margin-bottom: 8px;">No Akamai Detected</div>
                        <div style="opacity: 0.9; font-size: 14px;">The _abck cookie is not present on this page.</div>
                        <div style="opacity: 0.8; font-size: 12px; margin-top: 8px;">Akamai Bot Manager is not active here.</div>
                    `;
                    notif.style.animation = 'slideIn 0.3s ease-out';
                    document.body.appendChild(notif);

                    setTimeout(() => {
                        notif.style.animation = 'slideOut 0.3s ease-in';
                        setTimeout(() => notif.remove(), 300);
                    }, 5000);
                }
            });

            return false; // Cancel capture
        }

        // Log detected cookies
        Logger.network('[Akamai] Akamai cookies detected:', {
            _abck: !!abckCookie,
            bm_sz: !!bmSzCookie,
            ak_bmsc: !!akBmscCookie,
            abckLength: abckCookie?.value?.length || 0
        });

        // Delete _abck cookie to force sensor_data regeneration
        Logger.network('[Akamai] Deleting _abck cookie to force sensor_data regeneration...');
        try {
            await chrome.cookies.remove({
                url: this.tabInfo.url,
                name: '_abck'
            });
            Logger.network('[Akamai] _abck cookie deleted successfully');
        } catch (err) {
            Logger.network('[Akamai] Could not delete _abck cookie:', err);
        }

        // Check if already capturing - if so, stop it first
        const stateResponse = await this.sendMessage({
            type: 'AKAMAI_GET_CAPTURE_STATE',
            tabId: this.tabInfo.id
        });

        if (stateResponse && stateResponse.isCapturing) {
            await this.stopCapturing();
            return false; // Cancel this capture start
        }

        return true; // Proceed with capture
    };





    /**
     * Stop capturing
     */
AkamaiAdvanced.prototype.stopCapturing = async function() {
        try {
            const response = await chrome.runtime.sendMessage({
                type: 'AKAMAI_STOP_CAPTURE',
                tabId: this.tabInfo.id
            });

            this.updateCaptureButtonState(false);

            // Notifications are now handled by BaseInterceptorHelpers, no cleanup needed

            if (response && response.results && response.results.sensorData) {
                // Capture completed successfully
                await this.processCapturedData(response.results);
                NotificationHelper.success('Akamai data captured successfully!');
            } else {
                NotificationHelper.info('Capture stopped');
            }
        } catch (error) {
            Logger.error('NETWORK', 'Failed to stop capturing:', error);
            NotificationHelper.error('Failed to stop capturing: ' + error.message);
        }
    };