// X Article to Obsidian Markdown Converter - Service Worker

// Handle download requests from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'download') {
    handleDownload(request.dataUrl, request.filename)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep message channel open for async response
  }
});

async function handleDownload(dataUrl, filename) {
  try {
    await chrome.downloads.download({
      url: dataUrl,
      filename: sanitizeFilename(filename),
      saveAs: true
    });
  } catch (error) {
    console.error('Download error:', error);
    throw error;
  }
}

function sanitizeFilename(filename) {
  // Remove or replace invalid filename characters
  return filename
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
