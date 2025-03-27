import React, { useEffect, useRef, useState } from 'react';
import { BookDoc, getDirection } from '@/libs/document';
import { BookConfig } from '@/types/book';
import { FoliateView, wrappedFoliateView } from '@/types/view';
import { useThemeStore } from '@/store/themeStore';
import { useReaderStore } from '@/store/readerStore';
import { useParallelViewStore } from '@/store/parallelViewStore';
import { useClickEvent, useTouchEvent } from '../hooks/useIframeEvents';
import { useFoliateEvents } from '../hooks/useFoliateEvents';
import { useProgressSync } from '../hooks/useProgressSync';
import { useProgressAutoSave } from '../hooks/useProgressAutoSave';
import { getStyles, mountAdditionalFonts } from '@/utils/style';
import { getBookDirFromLanguage, getBookDirFromWritingMode } from '@/utils/book';
import { useUICSS } from '@/hooks/useUICSS';
import {
  handleKeydown,
  handleMousedown,
  handleMouseup,
  handleClick,
  handleWheel,
  handleTouchStart,
  handleTouchMove,
  handleTouchEnd,
} from '../utils/iframeEventHandlers';
import { getMaxInlineSize } from '@/utils/config';

// Define a custom namespace patch for all book documents
const NAMESPACES = {
  XLINK: 'http://www.w3.org/1999/xlink',
  XMLNS: 'http://www.w3.org/2000/xmlns/',
  SVG: 'http://www.w3.org/2000/svg'
};

// Global function to fix SVG content in HTML strings
const fixSVGContentInHTML = (html: string): string => {
  if (!html) return html;
  
  // Add xmlns:xlink declaration to the HTML element if needed
  if (html.includes('<html') && !html.includes('xmlns:xlink')) {
    html = html.replace(/<html([^>]*)>/i, 
      `<html$1 xmlns:xlink="${NAMESPACES.XLINK}">`);
  }
  
  // Add xlink namespace to SVG elements
  html = html.replace(/<svg([^>]*)>/gi, (match, p1) => {
    if (!p1.includes('xmlns:xlink')) {
      return `<svg${p1} xmlns:xlink="${NAMESPACES.XLINK}">`;
    }
    return match;
  });
  
  // Add missing namespace to any image elements with xlink:href attributes
  html = html.replace(/(<image[^>]*)(xlink:href)([^>]*>)/gi, (match, p1, p2, p3) => {
    if (!p1.includes('xmlns:xlink')) {
      return `${p1} xmlns:xlink="${NAMESPACES.XLINK}" ${p2}${p3}`;
    }
    return match;
  });
  
  // Replace SVG image elements with HTML img elements as a fallback
  // This is a more radical approach but ensures better compatibility
  html = html.replace(/<image([^>]*)(xlink:href=["']([^"']*)["'])([^>]*)>/gi, (match, p1, p2, url, p4) => {
    const urlValue = url.replace(/&quot;/g, '"').replace(/&apos;/g, "'");
    // Extract width and height if they exist
    const widthMatch = (p1 + p4).match(/width=["']([^"']*)["']/i);
    const heightMatch = (p1 + p4).match(/height=["']([^"']*)["']/i);
    const width = widthMatch ? ` width="${widthMatch[1]}"` : '';
    const height = heightMatch ? ` height="${heightMatch[1]}"` : '';
    
    // Create an HTML img tag as a replacement
    return `<img src="${urlValue}" alt="Book image"${width}${height} style="max-width:100%; height:auto;" />`;
  });
  
  return html;
};

const FoliateViewer: React.FC<{
  bookKey: string;
  bookDoc: BookDoc;
  config: BookConfig;
}> = ({ bookKey, bookDoc, config }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<FoliateView | null>(null);
  const isViewCreated = useRef(false);
  const coverInjectedRef = useRef(false);
  const { getView, setView: setFoliateView, setProgress } = useReaderStore();
  const { getViewSettings, setViewSettings } = useReaderStore();
  const { getParallels } = useParallelViewStore();
  const { themeCode, isDarkMode } = useThemeStore();
  const viewSettings = getViewSettings(bookKey)!;

  const [toastMessage, setToastMessage] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setToastMessage(''), 2000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  useUICSS(bookKey, viewSettings);
  useProgressSync(bookKey);
  useProgressAutoSave(bookKey);

  const progressRelocateHandler = (event: Event) => {
    const detail = (event as CustomEvent).detail;
    setProgress(bookKey, detail.cfi, detail.tocItem, detail.section, detail.location, detail.range);
  };

  // This adds the xlink namespace to any document that gets loaded
  const addXLinkNamespace = (doc: Document) => {
    try {
      // Fix the document element level
      const documentElement = doc.documentElement;
      if (documentElement && !documentElement.hasAttributeNS(NAMESPACES.XMLNS, 'xmlns:xlink')) {
        documentElement.setAttributeNS(NAMESPACES.XMLNS, 'xmlns:xlink', NAMESPACES.XLINK);
      }

      // Fix all HTML elements that might need xlink namespace
      doc.querySelectorAll('html').forEach(htmlElement => {
        if (!htmlElement.hasAttributeNS(NAMESPACES.XMLNS, 'xmlns:xlink')) {
          htmlElement.setAttributeNS(NAMESPACES.XMLNS, 'xmlns:xlink', NAMESPACES.XLINK);
        }
      });

      // Fix all SVG elements using different methods to ensure we catch everything
      const svgElements = Array.from(doc.getElementsByTagNameNS(NAMESPACES.SVG, 'svg') || [])
        .concat(Array.from(doc.getElementsByTagName('svg') || []));
      
      svgElements.forEach(svgElement => {
        if (!svgElement.hasAttributeNS(NAMESPACES.XMLNS, 'xmlns:xlink')) {
          svgElement.setAttributeNS(NAMESPACES.XMLNS, 'xmlns:xlink', NAMESPACES.XLINK);
        }
      });

      // Look for all elements with xlink:href attributes using multiple selectors
      const xlinkSelectors = ['*[xlink\\:href]', '*[*|href]', 'image'];
      const elementsWithHref = new Set<Element>();
      
      xlinkSelectors.forEach(selector => {
        try {
          const elements = doc.querySelectorAll(selector);
          elements.forEach(el => elementsWithHref.add(el));
        } catch (e) {
          // Ignore selector errors
        }
      });
      
      // Also find any "image" tags (case insensitive) which are commonly used in EPUB files
      try {
        const imageElements = doc.getElementsByTagName('image');
        if (imageElements) {
          for (let i = 0; i < imageElements.length; i++) {
            const element = imageElements[i];
            if (element) {
              elementsWithHref.add(element);
            }
          }
        }
      } catch (e) {
        // Ignore errors
      }
      
      elementsWithHref.forEach(element => {
        if (element.hasAttribute && 
            ((element.hasAttribute('xlink:href') && !element.lookupNamespaceURI('xlink')) ||
             element.tagName.toLowerCase() === 'image')) {
          element.setAttributeNS(NAMESPACES.XMLNS, 'xmlns:xlink', NAMESPACES.XLINK);
        }
      });

      // Special fix for EPUB files where <image> tag is used with xlink:href
      try {
        doc.querySelectorAll('image').forEach(imageElement => {
          // Ensure image has the xlink namespace
          if (!imageElement.hasAttributeNS(NAMESPACES.XMLNS, 'xmlns:xlink')) {
            imageElement.setAttributeNS(NAMESPACES.XMLNS, 'xmlns:xlink', NAMESPACES.XLINK);
          }
          
          // If the image has an xlink:href attribute but no XML namespace for it
          if (imageElement.hasAttribute('xlink:href') && !imageElement.lookupNamespaceURI('xlink')) {
            // Get the href value
            const href = imageElement.getAttribute('xlink:href');
            
            // First try to fix by adding the namespace
            imageElement.setAttributeNS(NAMESPACES.XMLNS, 'xmlns:xlink', NAMESPACES.XLINK);
            
            // If still not working, convert to a regular img element
            if (!imageElement.lookupNamespaceURI('xlink')) {
              try {
                const imgElement = doc.createElement('img');
                imgElement.setAttribute('src', href || '');
                imgElement.setAttribute('alt', 'Book cover image');
                imgElement.style.maxWidth = '100%';
                imgElement.style.height = 'auto';
                
                // Copy other attributes
                for (let i = 0; i < imageElement.attributes.length; i++) {
                  const attr = imageElement.attributes[i];
                  if (attr && attr.name !== 'xlink:href') {
                    imgElement.setAttribute(attr.name, attr.value);
                  }
                }
                
                // Replace the element
                if (imageElement.parentNode) {
                  imageElement.parentNode.replaceChild(imgElement, imageElement);
                }
              } catch (e) {
                console.error('Error converting image to img:', e);
              }
            }
          }
        });
      } catch (e) {
        console.error('Error fixing image elements:', e);
      }
      
      // Attempt to update raw innerHTML for sections with SVGs
      try {
        const sectionsWithSVG = doc.querySelectorAll('section:has(svg), div:has(svg), figure:has(svg)');
        sectionsWithSVG.forEach(section => {
          if (section.innerHTML && section.innerHTML.includes('<svg')) {
            section.innerHTML = fixSVGContentInHTML(section.innerHTML);
          }
        });
      } catch (e) {
        // :has selector may not be supported in all contexts
      }
      
      // Special handling for book cover section which often has SVG content
      ['section[epub\\:type="cover"]', '.cover', '#cover', 'section:first-child'].forEach(selector => {
        try {
          const coverSection = doc.querySelector(selector);
          if (coverSection && coverSection.innerHTML && 
              (coverSection.innerHTML.includes('<svg') || coverSection.innerHTML.includes('<image'))) {
            coverSection.innerHTML = fixSVGContentInHTML(coverSection.innerHTML);
          }
        } catch (e) {
          // Ignore selector errors
        }
      });
    } catch (error) {
      console.error('Error adding xlink namespace:', error);
    }
  };

  // Enhanced cover injection - handles more cases and positions the cover better
  const injectCoverImage = (doc: Document, forceCover: boolean = false) => {
    try {
      if (coverInjectedRef.current && !forceCover) return;
      
      const metadata = bookDoc.metadata as any;
      if (!metadata?.coverImageBlob) return;
      
      // Determine if this is likely a cover page
      const isLikelyCoverPage = 
        doc.title?.toLowerCase().includes('cover') || 
        doc.title?.toLowerCase().includes('title') ||
        (doc.URL && (doc.URL.includes('cover') || doc.URL.indexOf('.xhtml') === 0 || doc.URL.indexOf('.html') === 0)) ||
        doc.body?.innerHTML?.toLowerCase().includes('cover') ||
        doc.querySelector('meta[name="cover"]') !== null ||
        doc.body?.children.length === 0 || 
        doc.body?.children.length === 1;
      
      if ((isLikelyCoverPage || forceCover) && doc.body) {
        console.log('Injecting cover image on page:', doc.title || doc.URL);
        
        // Create the URL for the cover
        const coverUrl = URL.createObjectURL(metadata.coverImageBlob);
        
        // Remove any existing injected covers
        const existingCovers = doc.querySelectorAll('#booktalk-injected-cover');
        existingCovers.forEach(cover => cover.remove());
        
        // Create a styled container for our cover
        const coverContainer = doc.createElement('div');
        coverContainer.id = 'booktalk-injected-cover';
        coverContainer.style.position = 'absolute';
        coverContainer.style.top = '0';
        coverContainer.style.left = '0';
        coverContainer.style.width = '100%';
        coverContainer.style.height = '100%';
        coverContainer.style.display = 'flex';
        coverContainer.style.justifyContent = 'center';
        coverContainer.style.alignItems = 'center';
        coverContainer.style.zIndex = '1000';
        coverContainer.style.backgroundColor = 'transparent';
        
        // Create the image with appropriate styling
        const img = doc.createElement('img');
        img.src = coverUrl;
        img.alt = 'Book Cover';
        img.style.maxWidth = '95%';
        img.style.maxHeight = '95%';
        img.style.objectFit = 'contain';
        img.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
        img.style.borderRadius = '4px';
        
        // Add the image to the container
        coverContainer.appendChild(img);
        
        // Add event listeners to handle errors
        img.onerror = () => {
          console.error('Failed to load cover image');
          coverContainer.style.display = 'none';
        };
        
        // If this is the first page and appears empty, replace content completely
        if (isLikelyCoverPage && 
            (doc.body.children.length === 0 || 
             (doc.body.children.length === 1 && doc.body.children[0].tagName === 'STYLE'))) {
          
          // Preserve styles
          const styles = Array.from(doc.querySelectorAll('style'));
          
          // Clear the body but keep it properly styled
          doc.body.innerHTML = '';
          
          // Re-add styles to head
          styles.forEach(style => doc.head.appendChild(style.cloneNode(true)));
          
          // Style the body appropriately
          doc.body.style.margin = '0';
          doc.body.style.padding = '0';
          doc.body.style.overflow = 'hidden';
          doc.body.style.position = 'relative';
          doc.body.style.width = '100%';
          doc.body.style.height = '100%';
          
          // Add cover container
          doc.body.appendChild(coverContainer);
        } else {
          // Otherwise, just insert the cover overlay
          // Set position to relative (we already checked doc.body exists in the outer if)
          doc.body.style.position = 'relative';
          doc.body.appendChild(coverContainer);
        }
        
        coverInjectedRef.current = true;
      }
    } catch (error) {
      console.error('Error injecting cover image:', error);
    }
  };

  // Helper function to fix cover images
  const fixCoverImages = (doc: Document) => {
    try {
      // Check if this is a cover page and inject our cover image if needed
      injectCoverImage(doc);
      
      // First, try to find the cover image based on common selectors
      const coverSelectors = [
        'img[alt="Book cover image"]', 
        '.cover img', 
        '#cover-image',
        'img[src*="cover"]',
        'section[epub\\:type="cover"] img',
        'image[xlink\\:href*="cover"]',
        // Add additional selectors for Iron Gold and Murder Club specifically
        'image[alt="Book cover image"]',
        'body > image',
        '#cover image'
      ];
      
      let coverImg: HTMLImageElement | null = null;
      let coverSrc = '';
      
      // Check if this is the cover page based on title or metadata
      const isLikelyCoverPage = 
        doc.title.toLowerCase().includes('cover') || 
        doc.title.toLowerCase().includes('title') ||
        (doc.URL && doc.URL.includes('cover')) ||
        (doc.URL && doc.URL.includes('title')) ||
        doc.querySelector('meta[name="calibre:cover"][content="true"]') !== null;
      
      // If this is a cover page and we have cover metadata, inject it directly
      if (isLikelyCoverPage) {
        const metadata = bookDoc.metadata as any;
        if (metadata?.coverImageBlob && doc.body) {
          try {
            // Create a container if needed
            let container = doc.querySelector('.cover') || 
                           doc.querySelector('#cover') ||
                           doc.querySelector('section[epub\\:type="cover"]');
            
            if (!container) {
              container = doc.body;
            }
            
            // Create and inject the cover image
            const url = URL.createObjectURL(metadata.coverImageBlob);
            const img = doc.createElement('img');
            img.src = url;
            img.alt = "Book cover image";
            img.style.maxWidth = '100%';
            img.style.height = 'auto';
            img.style.display = 'block';
            img.style.margin = '0 auto';
            
            // Clear any existing content if this is a cover page to avoid duplicates
            if (container === doc.body && isLikelyCoverPage) {
              // Preserve only essential elements like style and metadata
              const elementsToKeep = Array.from(container.querySelectorAll('style, meta, link'));
              container.innerHTML = '';
              elementsToKeep.forEach(el => container.appendChild(el));
            }
            
            container.appendChild(img);
            return; // Exit early, we've handled this case
          } catch (error) {
            console.error('Error injecting cover directly:', error);
          }
        }
      }
      
      // First pass: try to find a regular HTML img element
      for (const selector of coverSelectors) {
        try {
          const element = doc.querySelector(selector);
          if (element && element instanceof HTMLImageElement) {
            coverImg = element;
            break;
          }
        } catch (e) {
          // Ignore selector errors
        }
      }
      
      // Second pass: if no HTML img found, check for SVG images with xlink:href
      if (!coverImg) {
        try {
          const svgImages = Array.from(doc.querySelectorAll('image'));
          for (const image of svgImages) {
            // Check if this has an xlink:href attribute
            if (image.hasAttribute('xlink:href')) {
              // Try to add the namespace if it's missing
              if (!image.hasAttributeNS(NAMESPACES.XMLNS, 'xmlns:xlink')) {
                image.setAttributeNS(NAMESPACES.XMLNS, 'xmlns:xlink', NAMESPACES.XLINK);
              }
              
              const href = image.getAttribute('xlink:href') || '';
              // Only convert the image if it's likely to be a cover
              const isCoverImage = 
                href.includes('cover') || 
                image.hasAttribute('alt') && image.getAttribute('alt')?.includes('cover') ||
                image.parentElement?.id === 'cover' ||
                image === doc.querySelector('body > image') ||
                isLikelyCoverPage;
              
              if (isCoverImage) {
                coverSrc = href;
                
                try {
                  // Instead of replacing the image, create a new img next to it
                  const img = doc.createElement('img');
                  img.setAttribute('src', coverSrc);
                  img.setAttribute('alt', 'Book cover image');
                  img.style.maxWidth = '100%';
                  img.style.height = 'auto';
                  img.style.display = 'block';
                  img.style.margin = '0 auto';
                  
                  // Copy dimensions
                  if (image.hasAttribute('width')) {
                    img.style.width = image.getAttribute('width') + 'px';
                  }
                  if (image.hasAttribute('height')) {
                    img.style.height = image.getAttribute('height') + 'px';
                  }
                  
                  // Insert the new image after the SVG image
                  if (image.parentNode) {
                    image.parentNode.insertBefore(img, image.nextSibling);
                    coverImg = img;
                    
                    // Hide the original image instead of removing it
                    // This preserves the document structure for navigation
                    image.style.display = 'none';
                    break;
                  }
                } catch (e) {
                  console.error('Error creating HTMLImageElement for cover:', e);
                }
              }
            }
          }
        } catch (e) {
          console.error('Error processing SVG images:', e);
        }
      }

      // If we found a cover image element, update it with the cover from metadata
      const metadata = bookDoc.metadata as any;
      if (coverImg && metadata?.coverImageBlob) {
        try {
          const url = URL.createObjectURL(metadata.coverImageBlob);
          coverImg.setAttribute('src', url);
        } catch (error) {
          console.error('Error setting cover image:', error);
        }
      }
      
      // If we still don't have a cover image but have a blob, try to inject one
      if (!coverImg && metadata?.coverImageBlob && doc.body) {
        try {
          // Look for possible cover containers
          const containerSelectors = [
            'section[epub\\:type="cover"]',
            'div[id="cover"]',
            '.cover',
            'section:first-child',
            'body > div:first-child'
          ];
          
          let container: Element | null = null;
          for (const selector of containerSelectors) {
            try {
              container = doc.querySelector(selector);
              if (container) break;
            } catch (e) {
              // Ignore selector errors
            }
          }
          
          // If no container was found, use the body as last resort
          if (!container) {
            container = doc.body;
          }
          
          // If we have a container, insert the cover image
          if (container) {
            const url = URL.createObjectURL(metadata.coverImageBlob);
            const img = doc.createElement('img');
            img.src = url;
            img.alt = "Book cover image";
            img.style.maxWidth = '100%';
            img.style.height = 'auto';
            img.style.display = 'block';
            img.style.margin = '0 auto';
            
            // If the container has children, insert before the first child
            if (container.firstChild) {
              container.insertBefore(img, container.firstChild);
            } else {
              container.appendChild(img);
            }
          }
        } catch (error) {
          console.error('Error inserting cover image:', error);
        }
      }
    } catch (error) {
      console.error('Error fixing cover images:', error);
    }
  };

  const docLoadHandler = (event: Event) => {
    const detail = (event as CustomEvent).detail;
    console.log('doc loaded:', detail);
    if (detail.doc) {
      // Add xlink namespace to fix SVG rendering issues
      addXLinkNamespace(detail.doc);
      
      // Try to fix or insert cover images
      fixCoverImages(detail.doc);
      
      const writingDir = viewRef.current?.renderer.setStyles && getDirection(detail.doc);
      const viewSettings = getViewSettings(bookKey)!;
      viewSettings.vertical =
        writingDir?.vertical || viewSettings.writingMode.includes('vertical') || false;
      viewSettings.rtl = writingDir?.rtl || viewSettings.writingMode.includes('rl') || false;
      setViewSettings(bookKey, { ...viewSettings });

      mountAdditionalFonts(detail.doc);

      if (!detail.doc.isEventListenersAdded) {
        detail.doc.isEventListenersAdded = true;
        detail.doc.addEventListener('keydown', handleKeydown.bind(null, bookKey));
        detail.doc.addEventListener('mousedown', handleMousedown.bind(null, bookKey));
        detail.doc.addEventListener('mouseup', handleMouseup.bind(null, bookKey));
        detail.doc.addEventListener('click', handleClick.bind(null, bookKey));
        detail.doc.addEventListener('wheel', handleWheel.bind(null, bookKey));
        detail.doc.addEventListener('touchstart', handleTouchStart.bind(null, bookKey));
        detail.doc.addEventListener('touchmove', handleTouchMove.bind(null, bookKey));
        detail.doc.addEventListener('touchend', handleTouchEnd.bind(null, bookKey));
      }
    }
  };

  const docRelocateHandler = (event: Event) => {
    const detail = (event as CustomEvent).detail;
    if (detail.reason !== 'scroll' && detail.reason !== 'page') return;

    if (detail.reason === 'scroll') {
      const renderer = viewRef.current?.renderer;
      const viewSettings = getViewSettings(bookKey)!;
      if (renderer && viewSettings.continuousScroll) {
        if (renderer.start <= 0) {
          viewRef.current?.prev(1);
          // sometimes viewSize has subpixel value that the end never reaches
        } else if (renderer.end + 1 >= renderer.viewSize) {
          viewRef.current?.next(1);
        }
      }
    }
    const parallelViews = getParallels(bookKey);
    if (parallelViews && parallelViews.size > 0) {
      parallelViews.forEach((key) => {
        if (key !== bookKey) {
          const target = getView(key)?.renderer;
          if (target) {
            target.goTo?.({ index: detail.index, anchor: detail.fraction });
          }
        }
      });
    }
  };

  useTouchEvent(bookKey, viewRef);
  const { handleTurnPage } = useClickEvent(bookKey, viewRef, containerRef);

  useFoliateEvents(viewRef.current, {
    onLoad: docLoadHandler,
    onRelocate: progressRelocateHandler,
    onRendererRelocate: docRelocateHandler,
  });

  useEffect(() => {
    if (viewRef.current && viewRef.current.renderer) {
      const viewSettings = getViewSettings(bookKey)!;
      viewRef.current.renderer.setStyles?.(getStyles(viewSettings));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeCode, isDarkMode]);

  // Patch the book loading process to add namespaces
  useEffect(() => {
    // Add a script element that patches XMLHttpRequest and fetch to add namespaces
    const script = document.createElement('script');
    script.textContent = `
      (function() {
        // Store the original XMLHttpRequest.prototype.open method
        const originalXHROpen = XMLHttpRequest.prototype.open;
        const originalXHRSend = XMLHttpRequest.prototype.send;
        
        // Override the XMLHttpRequest.prototype.send method
        XMLHttpRequest.prototype.send = function() {
          const originalOnLoad = this.onload;
          this.onload = function() {
            if (this.responseType === '' || this.responseType === 'text') {
              if (this.responseText && 
                  (this.responseText.includes('<svg') || 
                   this.responseText.includes('xlink:href'))) {
                Object.defineProperty(this, 'responseText', {
                  get: function() {
                    const originalText = originalGetResponseText.call(this);
                    if (originalText.includes('<svg') || originalText.includes('xlink:href')) {
                      return fixSVGContentInHTML(originalText);
                    }
                    return originalText;
                  }
                });
              }
            }
            if (originalOnLoad) originalOnLoad.apply(this, arguments);
          };
          return originalXHRSend.apply(this, arguments);
        };

        // Store the original responseText getter
        const originalGetResponseText = Object.getOwnPropertyDescriptor(
          XMLHttpRequest.prototype, 'responseText'
        ).get;
        
        // Override fetch for content from the book
        const originalFetch = window.fetch;
        window.fetch = function(resource, init) {
          return originalFetch.apply(this, arguments)
            .then(response => {
              const clone = response.clone();
              const contentType = response.headers.get('content-type');
              
              if (contentType && 
                 (contentType.includes('html') || 
                  contentType.includes('xml') || 
                  contentType.includes('text'))) {
                return clone.text().then(text => {
                  if (text.includes('<svg') || text.includes('xlink:href')) {
                    const fixedText = fixSVGContentInHTML(text);
                    const newResponse = new Response(fixedText, {
                      status: response.status,
                      statusText: response.statusText,
                      headers: response.headers
                    });
                    return newResponse;
                  }
                  return response;
                }).catch(() => response);
              }
              return response;
            });
        };
        
        function fixSVGContentInHTML(html) {
          if (!html) return html;
          
          // Add xlink namespace to SVG elements
          let fixedHTML = html.replace(/<svg([^>]*)>/gi, (match, p1) => {
            if (!p1.includes('xmlns:xlink')) {
              return '<svg' + p1 + ' xmlns:xlink="http://www.w3.org/1999/xlink">';
            }
            return match;
          });
          
          // Add xlink namespace to image elements with xlink:href but no namespace defined
          fixedHTML = fixedHTML.replace(/<image([^>]*)(xlink:href)([^>]*)>/gi, (match, p1, p2, p3) => {
            if (!p1.includes('xmlns:xlink')) {
              return '<image' + p1 + ' xmlns:xlink="http://www.w3.org/1999/xlink" ' + p2 + p3 + '>';
            }
            return match;
          });
          
          return fixedHTML;
        }
      })();
    `;
    document.head.appendChild(script);
    
    return () => {
      document.head.removeChild(script);
    };
  }, []);

  useEffect(() => {
    if (isViewCreated.current) return;
    isViewCreated.current = true;

    const openBook = async () => {
      console.log('Opening book', bookKey);
      await import('foliate-js/view.js');
      const view = wrappedFoliateView(document.createElement('foliate-view') as FoliateView);
      view.id = `foliate-view-${bookKey}`;
      document.body.append(view);
      containerRef.current?.appendChild(view);

      const writingMode = viewSettings.writingMode;
      if (writingMode) {
        const settingsDir = getBookDirFromWritingMode(writingMode);
        const languageDir = getBookDirFromLanguage(bookDoc.metadata.language);
        if (settingsDir !== 'auto') {
          bookDoc.dir = settingsDir;
        } else if (languageDir !== 'auto') {
          bookDoc.dir = languageDir;
        }
      }

      // Extract and save the cover image for later use
      const metadata = bookDoc.metadata as any;
      if (metadata?.cover) {
        try {
          const cover = await bookDoc.getCover?.();
          if (cover) {
            metadata.coverImageBlob = cover;
          }
        } catch (error) {
          console.error('Error extracting book cover:', error);
        }
      }

      // Open the book
      await view.open(bookDoc);
      viewRef.current = view;
      setFoliateView(bookKey, view);

      // Force inject cover on the first page after book is opened
      try {
        // Get the iframe that contains the book content
        setTimeout(() => {
          const iframe = containerRef.current?.querySelector('iframe');
          if (iframe && iframe.contentDocument) {
            // Force inject cover on first page
            injectCoverImage(iframe.contentDocument, true);
          }
        }, 300);
        
        // Try again after a slight delay to ensure content is fully loaded
        setTimeout(() => {
          const iframe = containerRef.current?.querySelector('iframe');
          if (iframe && iframe.contentDocument) {
            injectCoverImage(iframe.contentDocument, true);
          }
        }, 1000);
      } catch (error) {
        console.error('Error injecting cover after book open:', error);
      }

      // Patch navigation methods to prevent errors
      try {
        // Fix the prev method to catch errors
        const originalPrev = view.prev;
        view.prev = async function(this: FoliateView, n: number = 1): Promise<any> {
          try {
            return await originalPrev.call(this, n);
          } catch (error) {
            console.error('Navigation error (prev):', error);
            return false;
          }
        };
        
        // Fix the next method to catch errors
        const originalNext = view.next;
        view.next = async function(this: FoliateView, n: number = 1): Promise<any> {
          try {
            return await originalNext.call(this, n);
          } catch (error) {
            console.error('Navigation error (next):', error);
            return false;
          }
        };
        
        // Fix the goToFraction method to catch errors
        const originalGoToFraction = view.goToFraction;
        view.goToFraction = async function(this: FoliateView, fraction: number): Promise<any> {
          try {
            return await originalGoToFraction.call(this, fraction);
          } catch (error) {
            console.error('Navigation error (goToFraction):', error);
            return false;
          }
        };
      } catch (e) {
        console.error('Error patching navigation methods:', e);
      }

      // Fix the iframe document if possible
      try {
        const iframe = containerRef.current?.querySelector('iframe');
        if (iframe && iframe.contentDocument) {
          addXLinkNamespace(iframe.contentDocument);
        }
      } catch (e) {
        console.error('Could not access iframe content document:', e);
      }

      view.renderer.setStyles?.(getStyles(viewSettings));

      const isScrolled = viewSettings.scrolled!;
      const marginPx = viewSettings.marginPx!;
      const gapPercent = viewSettings.gapPercent!;
      const animated = viewSettings.animated!;
      const maxColumnCount = viewSettings.maxColumnCount!;
      const maxInlineSize = getMaxInlineSize(viewSettings);
      const maxBlockSize = viewSettings.maxBlockSize!;
      if (animated) {
        view.renderer.setAttribute('animated', '');
      } else {
        view.renderer.removeAttribute('animated');
      }
      view.renderer.setAttribute('flow', isScrolled ? 'scrolled' : 'paginated');
      view.renderer.setAttribute('margin', `${marginPx}px`);
      view.renderer.setAttribute('gap', `${gapPercent}%`);
      view.renderer.setAttribute('max-column-count', maxColumnCount);
      view.renderer.setAttribute('max-inline-size', `${maxInlineSize}px`);
      view.renderer.setAttribute('max-block-size', `${maxBlockSize}px`);

      const lastLocation = config.location;
      if (lastLocation) {
        await view.init({ lastLocation });
      } else {
        await view.goToFraction(0);
      }
    };

    openBook();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div
        className='foliate-viewer h-[100%] w-[100%]'
        onClick={(event) => handleTurnPage(event)}
        ref={containerRef}
      />
    </>
  );
};

export default FoliateViewer;
