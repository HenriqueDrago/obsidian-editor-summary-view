import { Plugin, WorkspaceLeaf, Notice, ItemView, TFile, debounce } from "obsidian";
import { PULL_ICON, SYNC_CLOSE_ICON, LIST_CHANGED_ICON, GIT_COMMIT_SYNC_ICON } from "src/constants";
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

  // Ensure folder path ends with a slash if it's not the root
  const folderPrefix = normalizedFolderPath === '/' ? '/' : normalizedFolderPath + '/';

  return normalizedFilePath.startsWith(folderPrefix);
}

function getWordCount(text: string, ignoreContractions: boolean): number {
  let cleanedText = text;
  // Remove common contractions before counting if the setting is enabled
  if (ignoreContractions) {
    cleanedText = text.replace(/'(s|d|ll|ve|re|m)\b/gi, ''); // Use \b to ensure it's a word boundary after the contraction
  }

  const spaceDelimitedChars =
    /'’A-Za-z\u00AA\u00B5\u00BA\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0370-\u0374\u0376\u0377\u037A-\u037D\u037F\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u048A-\u052F\u0531-\u0556\u0559\u0561-\u0587\u05D0-\u05EA\u05F0-\u05F2\u0620-\u064A\u066E\u066F\u0671-\u06D3\u06D5\u06E5\u06E6\u06EE\u06EF\u06FA-\u06FC\u06FF\u0710\u0712-\u072F\u074D-\u07A5\u07B1\u07CA-\u07EA\u07F4\u07F5\u07FA\u0800-\u0815\u081A\u0824\u0828\u0840-\u0858\u08A0-\u08B4\u0904-\u0939\u093D\u0950\u0958-\u0961\u0971-\u0980\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BD\u09CE\u09DC\u09DD\u09DF-\u09E1\u09F0\u09F1\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A59-\u0A5C\u0A5E\u0A72-\u0A74\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABD\u0AD0\u0AE0\u0AE1\u0AF9\u0B05-\u0B0C\u0B0F-\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3D\u0B5C\u0B5D\u0B5F-\u0B61\u0B71\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BD0\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C39\u0C3D\u0C58-\u0C5A\u0C60\u0C61\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBD\u0CDE\u0CE0\u0CE1\u0CF1\u0CF2\u0D05-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D\u0D4E\u0D5F-\u0D61\u0D7A-\u0D7F\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0E01-\u0E30\u0E32\u0E33\u0E40-\u0E46\u0E81\u0E82\u0E84\u0E87\u0E88\u0E8A\u0E8D\u0E94-\u0E97\u0E99-\u0E9F\u0EA1-\u0EA3\u0EA5\u0EA7\u0EAA\u0EAB\u0EAD-\u0EB0\u0EB2\u0EB3\u0EBD\u0EC0-\u0EC4\u0EC6\u0EDC-\u0EDF\u0F00\u0F40-\u0F47\u0F49-\u0F6C\u0F88-\u0F8C\u1000-\u102A\u103F\u1050-\u1055\u105A-\u105D\u1061\u1065\u1066\u106E-\u1070\u1075-\u1081\u108E\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u1380-\u138F\u13A0-\u13F5\u13F8-\u13FD\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u16F1-\u16F8\u1700-\u170C\u170E-\u1711\u1720-\u1731\u1740-\u1751\u1760-\u176C\u176E-\u1770\u1780-\u17B3\u17D7\u17DC\u1820-\u1877\u1880-\u18A8\u18AA\u18B0-\u18F5\u1900-\u191E\u1950-\u196D\u1970-\u1974\u1980-\u19AB\u19B0-\u19C9\u1A00-\u1A16\u1A20-\u1A54\u1AA7\u1B05-\u1B33\u1B45-\u1B4B\u1B83-\u1BA0\u1BAE\u1BAF\u1BBA-\u1BE5\u1C00-\u1C23\u1C4D-\u1C4F\u1C5A-\u1C7D\u1CE9-\u1CEC\u1CEE-\u1CF1\u1CF5\u1CF6\u1D00-\u1DBF\u1E00-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u2071\u207F\u2090-\u209C\u2102\u2107\u210A-\u2113\u2115\u2119-\u211D\u2124\u2126\u2128\u212A-\u212D\u212F-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2183\u2184\u2C00-\u2C2E\u2C30-\u2C5E\u2C60-\u2CE4\u2CEB-\u2CEE\u2CF2\u2CF3\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D80-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u2E2F\u3005\u3006\u3031-\u3035\u303B\u303C\u3105-\u312D\u3131-\u318E\u31A0-\u31BA\u31F0-\u31FF\u3400-\u4DB5\uA000-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA61F\uA62A\uA62B\uA640-\uA66E\uA67F-\uA69D\uA6A0-\uA6E5\uA717-\uA71F\uA722-\uA788\uA78B-\uA7AD\uA7B0-\uA7B7\uA7F7-\uA801\uA803-\uA805\uA807-\uA80A\uA80C-\uA822\uA840-\uA873\uA882-\uA8B3\uA8F2-\uA8F7\uA8FB\uA8FD\uA90A-\uA925\uA930-\uA946\uA960-\uA97C\uA984-\uA9B2\uA9CF\uA9E0-\uA9E4\uA9E6-\uA9EF\uA9FA-\uA9FE\uAA00-\uAA28\uAA40-\uAA42\uAA44-\uAA4B\uAA60-\uAA76\uAA7A\uAA7E-\uAAAF\uAAB1\uAAB5\uAAB6\uAAB9-\uAABD\uAAC0\uAAC2\uAADB-\uAADD\uAAE0-\uAAEA\uAAF2-\uAAF4\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uAB30-\uAB5A\uAB5C-\uAB65\uAB70-\uABE2\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D\uFB1F-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE70-\uFE74\uFE76-\uFEFC\uFF21-\uFF3A\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC/
      .source;

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
  lastNoteDisplayEl: HTMLElement; // Element to display the last opened note path

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

    // Create the element to display the word count below the buttons
    this.wordCountDisplayEl = contentContainer.createEl('div', {
      cls: 'word-count-display' // Custom class for styling
    });

    // Button to open the last opened note from the target folder
    const openLastNoteButton = contentContainer.createEl('button', {
      text: 'Open Lastest Chapter',
      cls: 'mod-cta' // Obsidian's call-to-action button style
    });
    this.registerDomEvent(openLastNoteButton, 'click', () => {
        this.plugin.openLastNoteFromTargetFolder();
    });

    // Initial update of the word count display
    this.plugin.updateStats();
    this.updateLastNoteDisplay(this.plugin.lastOpenedNoteInTargetFolder);
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

  // Method to update the display element for the last opened note path
  updateLastNoteDisplay(filePath: string | null) {
    if (this.lastNoteDisplayEl) {
        if (filePath) {
            this.lastNoteDisplayEl.textContent = `Last note in folder: ${filePath}`;
        } else {
            this.lastNoteDisplayEl.textContent = 'No note opened yet in the target folder.';
        }
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

    this.registerEvent(
      this.app.workspace.on('active-leaf-change', async (leaf) => {
        // Update word count stats
        this.updateStats();

        // Check if the newly active file is in the target folder and update last opened note
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile instanceof TFile && this.settings.targetFolderPath && isFileInFolder(activeFile, this.settings.targetFolderPath)) {
            this.lastOpenedNoteInTargetFolder = activeFile.path;
             // Update the display in the custom view if it's open
            this.app.workspace.getLeavesOfType(CUSTOM_GIT_VIEW_TYPE).forEach(viewLeaf => {
                if (viewLeaf.view instanceof CustomView) {
                    viewLeaf.view.updateLastNoteDisplay(this.lastOpenedNoteInTargetFolder);
                }
            });
        }
    })
    );

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

    // Update the last note display in the view based on the new folder setting
    this.lastOpenedNoteInTargetFolder = null; // Reset when folder setting changes
    this.app.workspace.getLeavesOfType(CUSTOM_GIT_VIEW_TYPE).forEach(viewLeaf => {
        if (viewLeaf.view instanceof CustomView) {
            viewLeaf.view.updateLastNoteDisplay(this.lastOpenedNoteInTargetFolder);
        }
    });
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
    const activeFile = this.app.workspace.getActiveFile();

    if (activeFile instanceof TFile && activeFile.extension === 'md') {
      const content = await this.app.vault.read(activeFile);

      let contentToCount = content;

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
          // Corrected regex to match newlines without the 's' flag
          contentToCount = contentToCount.replace(/%%[\s\S]*?%%/g, '');
      }


      // Get character count using the integrated function on cleaned content
      const charCount = getCharacterCount(contentToCount);

      // Get word count using the integrated function on cleaned content, passing the setting
      const wordCount = getWordCount(contentToCount, this.settings.ignoreContractions);

      // Calculate page count using the configurable words per page
      const pageCount = (wordCount / this.settings.wordsPerPage).toFixed(2); // Use toFixed(2) for two decimal places

      const textCount = `Chars: ${charCount}<br>Words: ${wordCount}<br>Pages: ${pageCount}`

      // Update the status bar item with the counts
      if (this.statusBarItemEl) {
        this.statusBarItemEl.innerHTML = textCount;
      }

      // Find the active CustomView instance and update its display
      this.app.workspace.getLeavesOfType(CUSTOM_GIT_VIEW_TYPE).forEach(leaf => {
        if (leaf.view instanceof CustomView) {
            leaf.view.updateWordCountDisplay(textCount);
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

  // Method to open the last opened note from the target folder
  async openLastNoteFromTargetFolder() {
    if (this.lastOpenedNoteInTargetFolder) {
        const file = this.app.vault.getAbstractFileByPath(this.lastOpenedNoteInTargetFolder);
        if (file instanceof TFile) {
            const newLeaf = this.app.workspace.getLeaf('split', 'vertical'); // Opens in a new split
            await newLeaf.openFile(file);
        } else {
            new Notice(`File not found: ${this.lastOpenedNoteInTargetFolder}`);
            this.lastOpenedNoteInTargetFolder = null; // Clear if file is gone
            // Update the display in the custom view if it's open
            this.app.workspace.getLeavesOfType(CUSTOM_GIT_VIEW_TYPE).forEach(viewLeaf => {
                if (viewLeaf.view instanceof CustomView) {
                    viewLeaf.view.updateLastNoteDisplay(this.lastOpenedNoteInTargetFolder);
                }
            });
        }
    } else {
        new Notice('No note from the target folder has been opened yet.');
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

