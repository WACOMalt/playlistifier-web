// Changelog page functionality
class ChangelogPage {
    constructor() {
        this.init();
    }

    init() {
        // Load changelog when page loads
        document.addEventListener('DOMContentLoaded', () => {
            this.loadChangelog();
            this.initCollapsible();
        });
    }
    
    // Initialize collapsible functionality
    initCollapsible() {
        const collapsibleLinks = document.querySelectorAll('.collapsible');
        
        collapsibleLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                this.toggleSection(link);
            });
        });
        
        // Start with FAQ expanded and changelog collapsed
        const changelogLink = document.querySelector('.collapsible[data-target="#changelog-container"]');
        if (changelogLink) {
            this.toggleSection(changelogLink, true); // Force collapse
        }
    }
    
    // Toggle section visibility
    toggleSection(link, forceCollapse = false) {
        const targetSelector = link.getAttribute('data-target');
        const target = document.querySelector(targetSelector);
        
        if (!target) return;
        
        const isCollapsed = link.classList.contains('collapsed') || forceCollapse;
        
        if (isCollapsed) {
            // Expand
            link.classList.remove('collapsed');
            target.classList.remove('collapsed');
        } else {
            // Collapse
            link.classList.add('collapsed');
            target.classList.add('collapsed');
        }
    }

    // Fetch and display changelog from GitHub
    async loadChangelog() {
        const container = document.getElementById('changelog-container');
        
        try {
            const response = await fetch('/api/changelog');
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Failed to load changelog');
            }
            
            if (data.releases && data.releases.length > 0) {
                container.innerHTML = data.releases.map(release => `
                    <div class="changelog-entry">
                        <div class="changelog-version">
                            <a href="${release.html_url}" target="_blank" rel="noopener noreferrer" class="version-link">${release.tag_name}</a>
                        </div>
                        <div class="changelog-date">${new Date(release.published_at).toLocaleDateString()}</div>
                        <div class="changelog-body">${release.body || 'No description available.'}</div>
                    </div>
                `).join('');
            } else {
                container.innerHTML = '<div class="error-message">No changelog entries found.</div>';
            }
        } catch (error) {
            console.error('Error loading changelog:', error);
            container.innerHTML = `<div class="error-message">Error loading changelog: ${error.message}</div>`;
        }
    }
}

// Initialize the changelog page
new ChangelogPage();
