document.addEventListener('DOMContentLoaded', () => {
  const convertBtn = document.getElementById('convertBtn');
  const btnText = convertBtn.querySelector('.btn-text');
  const btnLoading = convertBtn.querySelector('.btn-loading');
  const status = document.getElementById('status');

  function showStatus(message, type) {
    status.textContent = message;
    status.className = `status show ${type}`;
  }

  function setLoading(loading) {
    convertBtn.disabled = loading;
    btnText.style.display = loading ? 'none' : 'inline';
    btnLoading.style.display = loading ? 'inline-flex' : 'none';
  }

  convertBtn.addEventListener('click', async () => {
    setLoading(true);
    status.className = 'status';

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab.url || (!tab.url.includes('x.com') && !tab.url.includes('twitter.com'))) {
        showStatus('Please navigate to an X.com article first.', 'error');
        setLoading(false);
        return;
      }

      showStatus('Extracting content...', 'info');

      // Inject JSZip first
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['lib/jszip.min.js']
      });

      // Then inject and execute the content script
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content/content.js']
      });

      // Get the result from the content script execution
      const response = results[0]?.result;

      if (response && response.success) {
        showStatus(`Download started: ${response.filename}`, 'success');
      } else {
        showStatus(response?.error || 'Conversion failed. Please try again.', 'error');
      }
    } catch (error) {
      console.error('Conversion error:', error);
      showStatus('Error: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  });
});
