/**
 * This script suppresses specific console logs to prevent cluttering the developer console
 * Specifically targeted at "pageshow" PageTransitionEvent logs from inject.js
 */

(function() {
  // Store original console methods
  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info
  };

  // Helper to check if this is a PageTransitionEvent that should be suppressed
  function isPageTransitionEvent(args) {
    if (!args || args.length === 0) return false;
    
    const firstArg = args[0];
    
    // Check if it's the specific "pageshow: PageTransitionEvent" pattern from inject.js:22
    if (typeof firstArg === 'string' && firstArg === 'pageshow:') {
      const secondArg = args[1];
      return secondArg instanceof Event && secondArg.type === 'pageshow';
    }
    
    // Check for direct PageTransitionEvent logging
    if (firstArg instanceof Event && firstArg.type === 'pageshow') {
      return true;
    }
    
    return false;
  }

  // Override console methods to filter out PageTransitionEvents
  console.log = function(...args) {
    // Skip logging if it's a PageTransitionEvent
    if (isPageTransitionEvent(args)) {
      return;
    }
    originalConsole.log.apply(console, args);
  };

  console.warn = function(...args) {
    if (isPageTransitionEvent(args)) {
      return;
    }
    originalConsole.warn.apply(console, args);
  };

  console.error = function(...args) {
    if (isPageTransitionEvent(args)) {
      return;
    }
    originalConsole.error.apply(console, args);
  };

  console.info = function(...args) {
    if (isPageTransitionEvent(args)) {
      return;
    }
    originalConsole.info.apply(console, args);
  };

  // Add a more aggressive approach to patch the specific inject.js console calls
  try {
    // Monitor when scripts are added to the page
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            // Look for script elements
            if (node.tagName === 'SCRIPT' && 
                node.src && 
                node.src.includes('inject.js')) {
              
              // Script found - add a specific patch for line 22
              setTimeout(() => {
                // Try to locate and override the specific function
                const scripts = document.getElementsByTagName('script');
                for (let i = 0; i < scripts.length; i++) {
                  if (scripts[i].src && scripts[i].src.includes('inject.js')) {
                    // Add a specific patch for the script
                    const patchScript = document.createElement('script');
                    patchScript.textContent = `
                      // Override any event handlers that might log PageTransitionEvent
                      window.addEventListener('pageshow', function(e) {
                        // Prevent the event from bubbling up
                        e.stopPropagation();
                        e.stopImmediatePropagation();
                      }, true);
                    `;
                    scripts[i].parentNode.insertBefore(patchScript, scripts[i].nextSibling);
                    break;
                  }
                }
              }, 0);
            }
          });
        }
      }
    });
    
    // Start observing
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  } catch (e) {
    // Silent catch - don't throw errors as this is just a quality-of-life improvement
  }
})();
