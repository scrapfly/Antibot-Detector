

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
        const cookies = await chrome.cookies.getAll({ url: this.tabInfo.url });

        const abckCookie = cookies.find(c => c.name === '_abck');
        const bmSzCookie = cookies.find(c => c.name === 'bm_sz');
        const akBmscCookie = cookies.find(c => c.name === 'ak_bmsc');

        // Must have _abck cookie to proceed
        if (!abckCookie) {
            Logger.network('[Akamai] No _abck cookie found - Akamai not detected on this page');

            // Show error notifications
            const tr = AkamaiAdvanced.tr;
            NotificationHelper.error(tr('advAkamaiNotDetectedToast', 'No Akamai detected on this page. The _abck cookie is not present.'));

            // Shared Scrapfly notice: what was checked, and what to do instead
            await this.sendMessage({
                type: AdvancedMessageTypes.ADVANCED_PAGE_NOTICE,
                tabId: this.tabInfo.id,
                options: {
                type: 'error',
                module: 'Akamai',
                title: tr('advAkamaiNoticeNotDetectedTitle', 'No Akamai Detected'),
                message: `${tr('advAkamaiNoticeNoAbck', 'The _abck cookie is not present on this page.')} ${tr('advAkamaiNoticeNotActive', 'Akamai Bot Manager is not active here.')}`,
                duration: 7000
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

        // Already capturing: this click stops it, and the cookie stays
        const stateResponse = await this.sendMessage({
            type: 'AKAMAI_GET_CAPTURE_STATE',
            tabId: this.tabInfo.id
        });

        if (stateResponse && stateResponse.isCapturing) {
            await this.stopCapturing();
            return false; // Cancel this capture start
        }

        // Delete _abck cookie to force sensor_data regeneration
        try {
            await chrome.cookies.remove({
                url: this.tabInfo.url,
                name: '_abck'
            });
            Logger.network('[Akamai] _abck cookie deleted successfully');
        } catch (err) {
            Logger.network('[Akamai] Could not delete _abck cookie:', err);
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

            if (!response || !['stopped', 'not_capturing'].includes(response.status)) {
                throw new Error((response && response.error) || BaseAdvancedModule._tr('advPanelNotAvailable', 'No confirmed response'));
            }
            this.updateCaptureButtonState(false);

            // Notifications are now handled by BaseInterceptorHelpers, no cleanup needed

            if (response && response.results && response.results.sensorData) {
                // Capture completed successfully
                await this.processCapturedData(response.results);
                NotificationHelper.success(AkamaiAdvanced.tr('advAkamaiCaptureSuccess', 'Akamai data captured successfully!'));
            } else {
                NotificationHelper.info(AkamaiAdvanced.tr('advAkamaiCaptureStopped', 'Capture stopped'));
            }
        } catch (error) {
            Logger.error('NETWORK', 'Failed to stop capturing:', error);
            NotificationHelper.error(AkamaiAdvanced.fmt('advAkamaiStopCaptureFailedFmt', 'Failed to stop capturing: {0}', error.message));
        }
    };