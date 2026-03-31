// X Article to Obsidian Markdown Converter - Content Script

(async () => {
  // Selectors for X.com article elements
  const SELECTORS = {
    articleWrapper: '[data-testid="twitterArticleReadView"]',
    title: '[data-testid="twitter-article-title"]',
    content: '[data-testid="twitterArticleRichTextView"]',
    images: '[data-testid="tweetPhoto"] img',
    authorLink: 'a[href^="/"][role="link"]'
  };

  try {
    return await convertArticle();
  } catch (error) {
    return { success: false, error: error.message };
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

    return {
      title,
      author,
      date,
      sourceUrl: window.location.href,
      content,
      imageUrls
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
        case 'span':
        case 'section':
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
    const { title, author, date, sourceUrl, content } = articleData;

    // Generate YAML frontmatter
    const frontmatter = [
      '---',
      `title: "${escapeYaml(title)}"`,
      `author: "${escapeYaml(author)}"`,
      `date: ${date}`,
      `source: "${sourceUrl}"`,
      'tags: [x-article]',
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
      .slice(0, 50) || 'article';

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
