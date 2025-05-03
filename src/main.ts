import { Plugin, WorkspaceLeaf, Notice, ItemView, TFile, debounce, MarkdownView } from "obsidian";
import { PULL_ICON, SYNC_CLOSE_ICON, LIST_CHANGED_ICON, GIT_COMMIT_SYNC_ICON, FILE_CHANGE_ICON, spaceDelimitedChars } from "src/constants";
import { CustomViewPluginSettingsTab, CustomViewPluginSettings, DEFAULT_SETTINGS } from "src/settings";

// Define the constant for the custom view type
const CUSTOM_GIT_VIEW_TYPE = 'git-actions-view'; // Renamed view type slightly

// Define command IDs for the Obsidian Git plugin
const GIT_PULL_COMMAND_ID = "obsidian-git:pull";
const GIT_COMMIT_SYNC_COMMAND_ID = "obsidian-git:push";
const GIT_LIST_CHANGED_COMMAND_ID = "obsidian-git:list-changed-files";
const GIT_BACKUP_SYNC_CLOSE_COMMAND_ID = "obsidian-git:backup-and-close";

// Helper function to check if a file is within a specific folder path
function isFileInFolder(file: TFile, folderPath: string): boolean {
  // Normalize paths for comparison
  const normalizedFilePath = file.path.replace(/\\/g, '/');
  const normalizedFolderPath = folderPath.replace(/\\/g, '/');

  // Handle root folder case
  if (normalizedFolderPath === '/' || normalizedFolderPath === '') {
    return true;
  }

  // Ensure folder path ends with a slash
  const folderPrefix = normalizedFolderPath.endsWith('/') ? normalizedFolderPath : normalizedFolderPath + '/';

  return normalizedFilePath.startsWith(folderPrefix);
}

function getWordCount(text: string, ignoreContractions: boolean): number {
  let cleanedText = text;
  // Remove common contractions before counting if the setting is enabled
  if (ignoreContractions) {
    cleanedText = text.replace(/'(s|d|ll|ve|re|m)\b/gi, ''); // Use \b to ensure it's a word boundary after the contraction
  }

  const nonSpaceDelimitedWords =
    /\u3041-\u3096\u309D-\u309F\u30A1-\u30FA\u30FC-\u30FF\u4E00-\u9FD5/.source;

  const nonSpaceDelimitedWordsOther =
    /[\u3041-\u3096\u309D-\u309F\u30A1-\u30FA\u30FC-\u30FF\u4E00-\u9FD5]{1}/
      .source;

  const pattern = new RegExp(
    [
      `(?:[0-9]+(?:(?:,|\\.)[0-9]+)*|[\\-${spaceDelimitedChars}])+`,
      nonSpaceDelimitedWords,
      nonSpaceDelimitedWordsOther,
    ].join("|"),
    "g"
  );
  // Match the pattern against the cleaned text
  return (cleanedText.match(pattern) || []).length;
}

function getCharacterCount(text: string): number {
  return text.length;
}

// Define the custom view class
class CustomView extends ItemView {
  plugin: CustomViewPlugin; // Reference back to the plugin instance
  wordCountDisplayEl: HTMLElement; // Element to display the word count

  constructor(leaf: WorkspaceLeaf, plugin: CustomViewPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  // Define the view type
  getViewType(): string {
    return CUSTOM_GIT_VIEW_TYPE;
  }

  // Define the view title
  getDisplayText(): string {
    return "Custom View";
  }

    // Method to get the view's icon for the ribbon, etc.
    getIcon(): string {
    return 'star';
  }

  // This method is called when the view is opened
  async onOpen(): Promise<void> {
    const contentContainer = this.containerEl.children[1]; // Target the content container
    contentContainer.empty(); // Clear existing content
    // Add a class for styling the container holding the buttons
    contentContainer.addClass('git-actions-view-container');


    // Create a container for the icon buttons to lay them out horizontally
    const iconButtonContainer = contentContainer.createDiv({
      cls: 'git-action-icon-button-group' // Custom class for button group
    });

    // --- Add Individual Icon Buttons ---

    // Button for Backup, Sync & Close
    const syncCloseButton = iconButtonContainer.createEl('div', {
      cls: 'clickable-icon git-action-icon-button mod-warning' // Added mod-warning for visual distinction
    });
    syncCloseButton.innerHTML = SYNC_CLOSE_ICON;
    syncCloseButton.setAttribute('aria-label', 'Backup, Sync and Close App');
      this.registerDomEvent(syncCloseButton, 'click', () => {
        this.plugin.executeGitCommand(GIT_BACKUP_SYNC_CLOSE_COMMAND_ID, 'Attempting to commit, sync, and close Obsidian...', 'Error executing Git Backup/Sync/Close.');
    });

    // Button for Commit and Sync
    const commitSyncButton = iconButtonContainer.createEl('div', {
      cls: 'clickable-icon git-action-icon-button' // Add custom class for styling
    });
    // Set the icon using innerHTML (or setIcon if available/preferred)
    commitSyncButton.innerHTML = GIT_COMMIT_SYNC_ICON;
    commitSyncButton.setAttribute('aria-label', 'Git Commit and Sync'); // Accessibility label
    this.registerDomEvent(commitSyncButton, 'click', () => {
      this.plugin.executeGitCommand(GIT_COMMIT_SYNC_COMMAND_ID, 'Attempting Git Commit and Sync...', 'Error executing Git Commit and Sync.');
    });

    // Button for Pull
    const pullButton = iconButtonContainer.createEl('div', {
      cls: 'clickable-icon git-action-icon-button' // Add custom class for styling
    });
    // Set the icon using innerHTML (or setIcon if available/preferred)
    pullButton.innerHTML = PULL_ICON;
    pullButton.setAttribute('aria-label', 'Git Pull'); // Accessibility label
    this.registerDomEvent(pullButton, 'click', () => {
      this.plugin.executeGitCommand(GIT_PULL_COMMAND_ID, 'Attempting Git Pull...', 'Error executing Git Pull.');
    });

    // Button for List Changed Files
     const listChangedButton = iconButtonContainer.createEl('div', {
        cls: 'clickable-icon git-action-icon-button'
    });
    listChangedButton.innerHTML = LIST_CHANGED_ICON;
    listChangedButton.setAttribute('aria-label', 'List Changed Files');
    this.registerDomEvent(listChangedButton, 'click', () => {
        this.plugin.executeGitCommand(GIT_LIST_CHANGED_COMMAND_ID, 'Attempting to list Git changes...', 'Error listing Git changes.');
    });

    // Button for List Changed Files
    const openLastNoteButton = iconButtonContainer.createEl('div', {
      cls: 'clickable-icon git-action-icon-button'
    });
    openLastNoteButton.innerHTML = FILE_CHANGE_ICON;
    openLastNoteButton.setAttribute('aria-label', 'Open Lastest Chapter');
    this.registerDomEvent(openLastNoteButton, 'click', () => {
      this.plugin.openFirstNoteWithProperty();
    });

    // Create the element to display the word count below the buttons
    this.wordCountDisplayEl = contentContainer.createEl('div', {
      cls: 'word-count-display' // Custom class for styling
    });

    // Initial update of the word count display
    this.plugin.updateStats();
  }

  // This method is called when the view is closed
  async onClose(): Promise<void> {
    // Any cleanup logic for the view goes here
  }

  updateWordCountDisplay(textCount: string) {
    if (this.wordCountDisplayEl) {
        this.wordCountDisplayEl.innerHTML = textCount;
    }
  }
}

export default class CustomViewPlugin extends Plugin {
  statusBarItemEl: HTMLElement | null = null; // Initialize as null
  settings: CustomViewPluginSettings; // Add settings property
  lastOpenedNoteInTargetFolder: string | null = null; // Track the last opened note in the target folder

  async onload() {
    console.log("Custom View plugin loaded");

    // Load settings
    await this.loadSettings();

    // Add the settings tab
    this.addSettingTab(new CustomViewPluginSettingsTab(this.app, this));

    // Conditionally create status bar item and register events based on setting
    if (this.settings.showInStatusBar) {
      this.createStatusBarItem();
    }

    // Register event for active leaf change (handles switching files)
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', async (leaf) => {
        // Update word count stats
        this.updateStats();
    })
    );

    // Register event for editor changes (handles typing and selection changes)
    this.registerEvent(
      this.app.workspace.on('editor-change', debounce(() => this.updateStats(), 500))
    );

    // Update the stats initially
    this.updateStats();

    // Check if the initial active file is in the target folder
    const initialActiveFile = this.app.workspace.getActiveFile();
    if (initialActiveFile instanceof TFile && this.settings.targetFolderPath && isFileInFolder(initialActiveFile, this.settings.targetFolderPath)) {
        this.lastOpenedNoteInTargetFolder = initialActiveFile.path;
    }

    // Register the custom view
    this.registerView(
      CUSTOM_GIT_VIEW_TYPE,
      (leaf) => new CustomView(leaf, this) as ItemView // Type assertion might be needed
    );

    // Add a command to open the custom view
    this.addCommand({
        id: 'open-custom-view',
        name: 'Open Custom View',
        callback: () => {
            this.activateView();
        }
    });

    // Add a ribbon icon to open the view
    // Using the same icon as the view itself
    this.addRibbonIcon(this.getIcon(), 'Open Custom View', () => {
        this.activateView();
    });
  }

   // Method to get the view's icon for the ribbon, etc.
  getIcon(): string {
    return 'star';
  }

  onunload() {
    if (this.statusBarItemEl) {
      this.statusBarItemEl.remove();
      this.statusBarItemEl = null; // Set to null after removing
    }
    console.log("Custom View plugin unloaded");
    // Obsidian automatically unregisters views and commands registered with this.register...
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    // Update status bar display based on the new setting
    if (this.settings.showInStatusBar && !this.statusBarItemEl) {
        this.createStatusBarItem();
    } else if (!this.settings.showInStatusBar && this.statusBarItemEl) {
        this.removeStatusBarItem();
    }
    // Update stats immediately after saving settings to reflect other changes
    this.updateStats();
  }

  createStatusBarItem() {
    // Create a status bar item
    this.statusBarItemEl = this.addStatusBarItem();
  }

  removeStatusBarItem() {
      if (this.statusBarItemEl) {
        this.statusBarItemEl.remove();
        this.statusBarItemEl = null;
      }
  }

  async updateStats() {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);

    if (activeView && activeView.file instanceof TFile) {
      const editor = activeView.editor;
      const selectedText = editor.getSelection();

      let contentToCount: string;
      let source: 'selection' | 'file';

      if (selectedText && selectedText.length > 0) {
        // Count selected text
        contentToCount = selectedText;
        source = 'selection';
      } else {
        // Count entire file content
        const content = await this.app.vault.read(activeView.file);
        contentToCount = content;
        source = 'file';

        // Apply settings only when counting the whole file
        // Remove the properties section at the beginning (between --- lines at the top) if the setting is enabled
        if (this.settings.ignoreFrontmatter && contentToCount.startsWith('---')) {
          const secondDashIndex = contentToCount.indexOf('---', 3); // Start searching after the first ---
          if (secondDashIndex !== -1) {
            // Find the end of the line after the second ---
            const endOfProperties = contentToCount.indexOf('\n', secondDashIndex);
            if (endOfProperties !== -1) {
              contentToCount = contentToCount.substring(endOfProperties + 1);
            } else {
              // If no newline after the second ---, assume the rest is properties
              contentToCount = '';
            }
          }
        }

        const marker = this.settings.marker;
        if (marker && marker.length > 0) {
          const markerIndex = contentToCount.indexOf(marker); // Start searching after the first marker
          if (markerIndex !== -1) {
            contentToCount = contentToCount.substring(markerIndex + marker.length);
          } else if (!this.settings.contAllContentIfNoMarker) {
            // If no marker found and setting disabled, count nothing
            contentToCount = '';
          }
        }

        // Remove markdown comments (between %%) if the setting is enabled
        if (this.settings.ignoreMarkdownComments) {
            contentToCount = contentToCount.replace(/%%[\s\S]*?%%/g, '');
        }
      }

      // Always apply ignoreContractions setting
      const charCount = getCharacterCount(contentToCount);
      const wordCount = getWordCount(contentToCount, this.settings.ignoreContractions);

      // Calculate page count using the configurable words per page
      const pageCount = (wordCount / this.settings.wordsPerPage).toFixed(2); // Use toFixed(2) for two decimal places

      // Add indicator if counting selection
      const sourceIndicator = source === 'selection' ? 'Selected ' : 'Total ';

      const textCountView = `${sourceIndicator}Chars: ${charCount}<br>${sourceIndicator}Words: ${wordCount}<br>${sourceIndicator}Pages: ${pageCount}`
      const textCountBar = `${sourceIndicator}Chars: ${charCount} | ${sourceIndicator}Words: ${wordCount} | ${sourceIndicator}Pages: ${pageCount}`

      // Update the status bar item with the counts
      if (this.statusBarItemEl) {
        this.statusBarItemEl.innerHTML = textCountBar;
      }

      // Find the active CustomView instance and update its display
      this.app.workspace.getLeavesOfType(CUSTOM_GIT_VIEW_TYPE).forEach(leaf => {
        if (leaf.view instanceof CustomView) {
            leaf.view.updateWordCountDisplay(textCountView);
        }
    });

    } else {
      // Clear the status bar item if no markdown file is active
      if (this.statusBarItemEl) {
        this.statusBarItemEl.setText('');
      }

      // Clear the word count display in all active CustomView instances if no markdown file is active
      this.app.workspace.getLeavesOfType(CUSTOM_GIT_VIEW_TYPE).forEach(leaf => {
        if (leaf.view instanceof CustomView) {
            leaf.view.updateWordCountDisplay(`Chars: 0<br>Words: 0<br>Pages: 0.00`);
        }
      });
    }
  }

  // Method to open or activate the custom view (kept for command/ribbon)
  async activateView() {
    const { workspace } = this.app;

    // Find an existing leaf of our view type
    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(CUSTOM_GIT_VIEW_TYPE);

    if (leaves.length > 0) {
      // A leaf already exists, use the first one
      leaf = leaves[0];
    } else {
      // No leaf exists, create a new one in the right sidebar
      leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf('split', 'vertical'); // Fallback if right sidebar is not available

      // Set the view state for the new leaf
      await leaf.setViewState({
        type: CUSTOM_GIT_VIEW_TYPE,
        active: true, // Make it active when opened
      });
    }

    // Ensure the leaf is active and revealed
    if (leaf) {
        workspace.revealLeaf(leaf);
    }
  }

  // New method to find and open the first note matching property criteria
  async openFirstNoteWithProperty() {
    const { targetFolderPath, propertyName, propertyValues } = this.settings;

    // Basic validation for settings
    if (!targetFolderPath || !propertyName || !propertyValues) {
      new Notice('Please configure the Target Folder Path, Property Name, and Allowed Property Values in plugin settings.');
      return;
    }

    const allowedValues = propertyValues.split(',').map(value => value.trim()).filter(value => value.length > 0);

    if (allowedValues.length === 0) {
         new Notice('Please specify at least one Allowed Property Value in plugin settings.');
         return;
    }

    const markdownFiles = this.app.vault.getMarkdownFiles();

    // Filter files based on folder and property
    const matchingFiles = markdownFiles.filter(file => {
      // Check if file is in the target folder
      if (!isFileInFolder(file, targetFolderPath)) {
        return false;
      }

      // Get the file's frontmatter cache
      const fileCache = this.app.metadataCache.getFileCache(file);
      if (!fileCache || !fileCache.frontmatter) {
        return false; // No frontmatter
      }

      // Check if the property exists in the frontmatter
      const propertyValue = fileCache.frontmatter[propertyName];
      if (propertyValue === undefined) {
        return false; // Property not found
      }

      // Check if the property value matches one of the allowed values
      // Handle both single values and list values from frontmatter
      if (Array.isArray(propertyValue)) {
          // If property is a list, check if any value in the list is in allowedValues
          return propertyValue.some(val => allowedValues.includes(String(val).trim()));
      } else {
          // If property is a single value, check if it's in allowedValues
          return allowedValues.includes(String(propertyValue).trim());
      }
    });

    // Sort the matching files alphabetically by path
    matchingFiles.sort((a, b) => a.path.localeCompare(b.path));

    if (matchingFiles.length > 0) {
      const firstMatchingFile = matchingFiles[0];
      try {
        let openedInExistingEditor = false;
        // Iterate through leaves to find an active markdown editor
        this.app.workspace.iterateAllLeaves(leaf => {
            if (leaf.view instanceof MarkdownView  && leaf.getRoot() === this.app.workspace.rootSplit) {
                // Found a markdown editor, open the file in a new tab within this leaf
                leaf.openFile(firstMatchingFile);
                openedInExistingEditor = true;
                // Stop iterating once we've opened the file
                return false;
            }
        });

        // If no active editor was found, open in a new vertical split leaf
        if (!openedInExistingEditor) {
            const newLeaf = this.app.workspace.getLeaf('split', 'vertical');
            await newLeaf.openFile(firstMatchingFile);
        }

      } catch (error) {
         console.error(`Error opening file: ${firstMatchingFile.path}`, error);
         new Notice(`Failed to open file: ${firstMatchingFile.path}`);
      }
    } else {
      new Notice(`No notes found in "${targetFolderPath}" with property "${propertyName}" having a value in [${allowedValues.join(', ')}].`);
    }
  }

  // Generic method to execute a Git command by ID
  async executeGitCommand(commandId: string, noticeMessage: string, errorMessage: string): Promise<void> {
    const appAny = this.app as any; // Type assertion to access internal commands
    try {
      new Notice(noticeMessage);
      // Ensure the Obsidian Git plugin is actually enabled and the command exists
      if (appAny.commands.commands[commandId]) {
           await appAny.commands.executeCommandById(commandId);
      } else {
           const missingPluginMsg = `Git Command ID "${commandId}" not found. Is the Obsidian Git plugin installed and enabled?`;
           console.error(missingPluginMsg);
           new Notice(missingPluginMsg);
      }

    } catch (error) {
      console.error(`Error executing Git command "${commandId}":`, error);
      new Notice(errorMessage);
    }
  };
}
