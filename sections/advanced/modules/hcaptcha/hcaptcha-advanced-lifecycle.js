HCaptchaAdvanced.prototype.afterCaptureStart = async function(response) {
        if (response && (response.status === 'started' || response.status === 'already_capturing')) {
            // Show brief notification in popup
            await AdvancedUtils.showCaptureStartNotification('hCaptcha');

            // Close popup after brief delay so user can see the page
            // The in-page notification will guide them to reload
            setTimeout(() => {
                window.close();
            }, 800); // 800ms delay so user sees the popup notification first
        }
    };
