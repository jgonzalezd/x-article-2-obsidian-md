// X Article to Obsidian Markdown Converter - Content Script

(async () => {
  // Selectors for X.com article elements
  const SELECTORS = {
    articleWrapper: '[data-testid="twitterArticleReadView"]',
    title: '[data-testid="twitter-article-title"]',
    content: '[data-testid="twitterArticleRichTextView"]',
    images: '[data-testid="tweetPhoto"] img',
    authorLink: 'a[href^="/"][role="link"]',
    tweet: '[data-testid="tweet"]',
    tweetUserName: '[data-testid="User-Name"]',
    tweetText: '[data-testid="tweetText"]',
    tweetPhoto: '[data-testid="tweetPhoto"] img'
  };

  try {
    return await convertPage();
  } catch (error) {
    return { success: false, error: error.message };
  }

  async function convertPage() {
    if (isTweetPage()) return await convertTweet();
    return await convertArticle();
  }

  function isTweetPage() {
    if (document.querySelector(SELECTORS.articleWrapper)) return false;
    if (/\/[^/]+\/status\/\d+/.test(window.location.pathname)) return true;
    return !!document.querySelector(SELECTORS.tweet);
  }

  async function convertArticle() {
    // Check if we're on an article page
    const articleWrapper = document.querySelector(SELECTORS.articleWrapper);
    if (!articleWrapper) {
      throw new Error('No X.com article found on this page. Please navigate to an article.');
    }

    // Extract article data
    const articleData = extractArticleData(articleWrapper);

    // Download images
    const images = await downloadAllImages(articleData.imageUrls);

    // Generate markdown
    const markdown = generateMarkdown(articleData, images);

    // Create and download zip
    const filename = await createAndDownloadZip(markdown, images, articleData.title);

    return { success: true, filename };
  }

  async function convertTweet() {
    const tweetEl = findPrimaryTweet();
    if (!tweetEl) {
      throw new Error('No tweet found on this page. Please navigate to a tweet status page.');
    }
    const tweetData = extractTweetData(tweetEl);
    const images = await downloadAllImages(tweetData.imageUrls);
    const markdown = generateTweetMarkdown(tweetData, images);
    const filename = await createAndDownloadZip(markdown, images, tweetData.title);
    return { success: true, filename };
  }

  function findPrimaryTweet() {
    const statusIdMatch = window.location.pathname.match(/\/status\/(\d+)/);
    const currentStatusId = statusIdMatch ? statusIdMatch[1] : null;
    const allTweets = document.querySelectorAll(SELECTORS.tweet);
    if (currentStatusId) {
      for (const tweet of allTweets) {
        if (tweet.querySelector(`a[href*="/status/${currentStatusId}"] time`)) return tweet;
      }
    }
    return allTweets[0] || null;
  }

  function extractTweetData(tweetEl) {
    const userNameEl = tweetEl.querySelector(SELECTORS.tweetUserName);
    const displayName = extractDisplayName(userNameEl);
    const username = extractUsername(userNameEl);
    const timeEl = tweetEl.querySelector('time[datetime]');
    const date = timeEl ? timeEl.getAttribute('datetime').split('T')[0] : new Date().toISOString().split('T')[0];
    const tweetUrl = extractTweetUrl(tweetEl);
    const textEl = tweetEl.querySelector(SELECTORS.tweetText);
    const { content, imageUrls } = extractTweetContent(tweetEl, textEl);
    const stats = extractEngagementStats(tweetEl);
    return { title: `Tweet by @${username}`, username, displayName, date, tweetUrl, content, imageUrls, stats };
  }

  function extractDisplayName(userNameEl) {
    if (!userNameEl) return 'Unknown';
    const span = userNameEl.querySelector('a span');
    return span ? span.textContent.trim() : 'Unknown';
  }

  function extractUsername(userNameEl) {
    if (!userNameEl) {
      const m = window.location.pathname.match(/^\/([^/]+)/);
      return m ? m[1] : 'unknown';
    }
    for (const span of userNameEl.querySelectorAll('span')) {
      const text = span.textContent.trim();
      if (text.startsWith('@')) return text.slice(1);
    }
    return 'unknown';
  }

  function extractTweetUrl(tweetEl) {
    const timeEl = tweetEl.querySelector('time');
    if (timeEl) {
      const link = timeEl.closest('a');
      if (link) {
        const href = link.getAttribute('href');
        if (href && href.includes('/status/'))
          return href.startsWith('http') ? href : `https://x.com${href}`;
      }
    }
    return window.location.href;
  }

  function extractTweetContent(tweetEl, textEl) {
    const imageUrls = [];
    let imageCounter = 0;
    tweetEl.querySelectorAll(SELECTORS.tweetPhoto).forEach(img => {
      const src = img.src;
      if (src && (src.includes('pbs.twimg.com') || src.includes('abs.twimg.com'))) {
        imageCounter++;
        const ext = getImageExtension(src);
        const name = `image-${imageCounter}.${ext}`;
        imageUrls.push({ url: src, name });
      }
    });
    if (!textEl) return { content: '', imageUrls };
    let content = htmlToMarkdown(textEl.cloneNode(true)).trim();
    for (const { name } of imageUrls) content += `\n\n![[images/${name}]]`;
    return { content, imageUrls };
  }

  function extractEngagementStats(el) {
    const stats = { replies: 0, likes: 0, reposts: 0, bookmarks: 0, views: 0 };
    const reply = el.querySelector('button[data-testid="reply"]');
    const like = el.querySelector('button[data-testid="like"]');
    const retweet = el.querySelector('button[data-testid="retweet"]');
    const bookmark = el.querySelector('button[data-testid="bookmark"]')
                  || el.querySelector('button[data-testid="removeBookmark"]');
    if (reply) stats.replies = parseStatFromAriaLabel(reply.getAttribute('aria-label'));
    if (like) stats.likes = parseStatFromAriaLabel(like.getAttribute('aria-label'));
    if (retweet) stats.reposts = parseStatFromAriaLabel(retweet.getAttribute('aria-label'));
    if (bookmark) stats.bookmarks = parseStatFromAriaLabel(bookmark.getAttribute('aria-label'));
    const analyticsLink = el.querySelector('a[href*="/analytics"]');
    if (analyticsLink) {
      stats.views = parseViewCount(analyticsLink.textContent.trim());
    } else {
      const group = el.querySelector('[role="group"][aria-label]');
      if (group) {
        const m = group.getAttribute('aria-label').match(/([\d,]+)\s+views/i);
        if (m) stats.views = parseInt(m[1].replace(/,/g, ''), 10);
      }
    }
    return stats;
  }

  function parseStatFromAriaLabel(label) {
    if (!label) return 0;
    const m = label.match(/^([\d,]+)\s/);
    return m ? parseInt(m[1].replace(/,/g, ''), 10) : 0;
  }

  function parseViewCount(text) {
    if (!text) return 0;
    const cleaned = text.replace(/,/g, '').replace(/views/i, '').trim();
    if (/[\d.]+K$/i.test(cleaned)) return Math.round(parseFloat(cleaned) * 1000);
    if (/[\d.]+M$/i.test(cleaned)) return Math.round(parseFloat(cleaned) * 1_000_000);
    return parseInt(cleaned, 10) || 0;
  }

  function generateTweetMarkdown(tweetData, images) {
    const { title, username, displayName, date, tweetUrl, content, stats } = tweetData;
    const frontmatter = [
      '---',
      `title: "${escapeYaml(title)}"`,
      `author: "${escapeYaml(username)}"`,
      `author_name: "${escapeYaml(displayName)}"`,
      `date: ${date}`,
      `source: "${tweetUrl}"`,
      'tags: [tweet]',
      `replies: ${stats.replies}`,
      `likes: ${stats.likes}`,
      `reposts: ${stats.reposts}`,
      `bookmarks: ${stats.bookmarks}`,
      `views: ${stats.views}`,
      '---'
    ].join('\n');
    return frontmatter + '\n\n' + content;
  }

  function extractArticleData(wrapper) {
    // Extract title
    const titleElement = wrapper.querySelector(SELECTORS.title);
    const title = titleElement ? titleElement.textContent.trim() : 'Untitled Article';

    // Extract author from URL or page
    const author = extractAuthor();

    // Extract date
    const date = extractDate();

    // Extract content and convert to markdown
    const contentElement = wrapper.querySelector(SELECTORS.content);
    const { content, imageUrls } = extractContent(contentElement);

    // Extract engagement stats from the parent article element
    const articleEl = wrapper.closest('article') || wrapper.parentElement;
    const stats = extractEngagementStats(articleEl);

    return {
      title,
      author,
      date,
      sourceUrl: window.location.href,
      content,
      imageUrls,
      stats
    };
  }

  function extractAuthor() {
    // Try to get from URL first (format: x.com/username/article/...)
    const urlMatch = window.location.pathname.match(/^\/([^/]+)/);
    if (urlMatch && urlMatch[1]) {
      return urlMatch[1];
    }

    // Fallback: try to find author link in the page
    const authorLinks = document.querySelectorAll('a[href^="/"]');
    for (const link of authorLinks) {
      const href = link.getAttribute('href');
      if (href && href.match(/^\/[^/]+$/) && !href.includes('home') && !href.includes('explore')) {
        return href.slice(1);
      }
    }

    return 'unknown';
  }

  function extractDate() {
    // Try to find time element
    const timeElement = document.querySelector('time');
    if (timeElement) {
      const datetime = timeElement.getAttribute('datetime');
      if (datetime) {
        return datetime.split('T')[0];
      }
    }

    // Fallback to current date
    return new Date().toISOString().split('T')[0];
  }

  function extractContent(contentElement) {
    if (!contentElement) {
      return { content: '', imageUrls: [] };
    }

    const imageUrls = [];
    let imageCounter = 0;

    // Clone the element to manipulate without affecting the page
    const clone = contentElement.cloneNode(true);

    // Process images first to get their URLs
    const images = clone.querySelectorAll('img');
    images.forEach(img => {
      const src = img.src;
      if (src && (src.includes('pbs.twimg.com') || src.includes('abs.twimg.com'))) {
        imageCounter++;
        const extension = getImageExtension(src);
        const imageName = `image-${imageCounter}.${extension}`;
        imageUrls.push({ url: src, name: imageName });

        // Replace img with markdown placeholder
        const placeholder = document.createTextNode(`\n\n![[images/${imageName}]]\n\n`);
        img.parentNode.replaceChild(placeholder, img);
      }
    });

    // Convert HTML to markdown
    const markdown = htmlToMarkdown(clone);

    return { content: markdown, imageUrls };
  }

  function getImageExtension(url) {
    // Try to extract extension from URL
    const formatMatch = url.match(/format=(\w+)/);
    if (formatMatch) {
      return formatMatch[1];
    }

    // Check common extensions in URL
    if (url.includes('.png')) return 'png';
    if (url.includes('.gif')) return 'gif';
    if (url.includes('.webp')) return 'webp';

    // Default to jpg
    return 'jpg';
  }

  function htmlToMarkdown(element) {
    let markdown = '';

    function processNode(node, listType = null, listDepth = 0) {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) {
        return '';
      }

      const tag = node.tagName.toLowerCase();
      let result = '';

      // Handle different elements
      switch (tag) {
        case 'h1':
          result = `\n\n# ${getTextContent(node)}\n\n`;
          break;
        case 'h2':
          result = `\n\n## ${getTextContent(node)}\n\n`;
          break;
        case 'h3':
          result = `\n\n### ${getTextContent(node)}\n\n`;
          break;
        case 'h4':
          result = `\n\n#### ${getTextContent(node)}\n\n`;
          break;
        case 'p':
          result = `\n\n${processChildren(node)}\n\n`;
          break;
        case 'br':
          result = '\n';
          break;
        case 'strong':
        case 'b':
          result = `**${processChildren(node)}**`;
          break;
        case 'em':
        case 'i':
          result = `*${processChildren(node)}*`;
          break;
        case 'u':
          result = `<u>${processChildren(node)}</u>`;
          break;
        case 's':
        case 'strike':
        case 'del':
          result = `~~${processChildren(node)}~~`;
          break;
        case 'code':
          result = `\`${getTextContent(node)}\``;
          break;
        case 'pre':
          result = `\n\n\`\`\`\n${getTextContent(node)}\n\`\`\`\n\n`;
          break;
        case 'blockquote':
          const quoteContent = processChildren(node).trim().split('\n').map(line => `> ${line}`).join('\n');
          result = `\n\n${quoteContent}\n\n`;
          break;
        case 'ul':
          result = '\n' + processListItems(node, 'ul', listDepth) + '\n';
          break;
        case 'ol':
          result = '\n' + processListItems(node, 'ol', listDepth) + '\n';
          break;
        case 'li':
          const indent = '  '.repeat(listDepth);
          const bullet = listType === 'ol' ? '1.' : '-';
          result = `${indent}${bullet} ${processChildren(node).trim()}\n`;
          break;
        case 'a':
          const href = node.getAttribute('href');
          const text = processChildren(node);
          result = processLink(href, text);
          break;
        case 'img':
          // Already handled in extractContent
          result = node.textContent || '';
          break;
        case 'hr':
          result = '\n\n---\n\n';
          break;
        case 'div':
          result = node.getAttribute('data-block') === 'true'
            ? `\n\n${processChildren(node)}\n\n`
            : processChildren(node);
          break;
        case 'section':
          result = node.getAttribute('data-block') === 'true'
            ? `\n\n${processChildren(node)}\n\n`
            : processChildren(node);
          break;
        case 'span': {
          const spanStyle = node.getAttribute('style') || '';
          result = (spanStyle.includes('font-weight: bold') || spanStyle.includes('font-weight:bold'))
            ? `**${processChildren(node)}**`
            : processChildren(node);
          break;
        }
        case 'article':
        default:
          result = processChildren(node);
          break;
      }

      return result;
    }

    function processChildren(node) {
      let result = '';
      for (const child of node.childNodes) {
        result += processNode(child);
      }
      return result;
    }

    function processListItems(listNode, type, depth) {
      let result = '';
      for (const child of listNode.children) {
        if (child.tagName.toLowerCase() === 'li') {
          const indent = '  '.repeat(depth);
          const bullet = type === 'ol' ? '1.' : '-';

          // Process li content but handle nested lists separately
          let liContent = '';
          let nestedList = '';

          for (const liChild of child.childNodes) {
            const childTag = liChild.tagName?.toLowerCase();
            if (childTag === 'ul' || childTag === 'ol') {
              nestedList += processListItems(liChild, childTag, depth + 1);
            } else {
              liContent += processNode(liChild);
            }
          }

          result += `${indent}${bullet} ${liContent.trim()}\n`;
          if (nestedList) {
            result += nestedList;
          }
        }
      }
      return result;
    }

    function getTextContent(node) {
      return node.textContent.trim();
    }

    function processLink(href, text) {
      if (!href) return text;

      // Convert relative URLs to absolute
      let absoluteUrl = href;
      if (href.startsWith('/')) {
        absoluteUrl = `https://x.com${href}`;
      }

      // Check if it's an internal X.com link
      const isInternalLink = absoluteUrl.includes('x.com') || absoluteUrl.includes('twitter.com');

      // Check if it's a mention (link to user profile)
      const mentionMatch = href.match(/^\/([a-zA-Z0-9_]+)$/);
      if (mentionMatch && text.startsWith('@')) {
        // Convert to Obsidian-style mention with link
        const username = mentionMatch[1];
        return `[[@${username}]](https://x.com/${username})`;
      }

      // Remove internal X.com links (non-mention)
      if (isInternalLink) {
        return text;
      }

      // Keep external links
      return `[${text}](${absoluteUrl})`;
    }

    markdown = processNode(element);

    // Clean up excessive whitespace
    markdown = markdown
      .replace(/\n{4,}/g, '\n\n\n')
      .replace(/^\s+|\s+$/g, '')
      .trim();

    return markdown;
  }

  async function downloadAllImages(imageUrls) {
    const images = [];

    for (const { url, name } of imageUrls) {
      try {
        // Fetch image as blob
        const response = await fetch(url);
        if (!response.ok) {
          console.warn(`Failed to fetch image: ${url}`);
          continue;
        }

        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();

        images.push({
          name,
          data: arrayBuffer,
          type: blob.type
        });
      } catch (error) {
        console.warn(`Error downloading image ${url}:`, error);
      }
    }

    return images;
  }

  function generateMarkdown(articleData, images) {
    const { title, author, date, sourceUrl, content, stats } = articleData;

    // Generate YAML frontmatter
    const frontmatter = [
      '---',
      `title: "${escapeYaml(title)}"`,
      `author: "${escapeYaml(author)}"`,
      `date: ${date}`,
      `source: "${sourceUrl}"`,
      'tags: [x-article]',
      `replies: ${stats.replies}`,
      `likes: ${stats.likes}`,
      `reposts: ${stats.reposts}`,
      `bookmarks: ${stats.bookmarks}`,
      `views: ${stats.views}`,
      '---'
    ].join('\n');

    // Build markdown content
    let markdown = frontmatter + '\n\n';

    // Add title as heading
    markdown += `# ${title}\n\n`;

    // Add main content
    markdown += content;

    return markdown;
  }

  function escapeYaml(str) {
    return str.replace(/"/g, '\\"').replace(/\n/g, ' ');
  }

  async function createAndDownloadZip(markdown, images, title) {
    // JSZip is pre-loaded by popup.js via chrome.scripting.executeScript
    const zip = new JSZip();

    // Create filename from title
    const safeTitle = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50) || 'export';

    // Add markdown file with same name as zip
    zip.file(`${safeTitle}.md`, markdown);

    // Add images folder with images
    if (images.length > 0) {
      const imgFolder = zip.folder('images');
      for (const image of images) {
        imgFolder.file(image.name, image.data);
      }
    }

    // Generate zip blob
    const zipBlob = await zip.generateAsync({ type: 'blob' });

    const filename = `${safeTitle}.zip`;

    // Trigger download via background script
    const dataUrl = await blobToDataUrl(zipBlob);

    chrome.runtime.sendMessage({
      action: 'download',
      dataUrl,
      filename
    });

    return filename;
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
})();
