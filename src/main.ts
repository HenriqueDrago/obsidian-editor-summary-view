import { Plugin, WorkspaceLeaf, Notice, ItemView, TFile, MarkdownView, debounce } from "obsidian";
import { PULL_ICON, SYNC_CLOSE_ICON, LIST_CHANGED_ICON, GIT_COMMIT_SYNC_ICON, FILE_CHANGE_ICON, SINGLE_QUOTE_ICON, DOUBLE_QUOTE_ICON } from "src/constants";import { CustomViewPluginSettingsTab, CustomViewPluginSettings, DEFAULT_SETTINGS } from "src/settings";

// Define the constant for the custom view type
const CUSTOM_GIT_VIEW_TYPE = 'git-actions-view';

// Define command IDs for the Obsidian Git plugin
const GIT_PULL_COMMAND_ID = "obsidian-git:pull";
const GIT_COMMIT_SYNC_COMMAND_ID = "obsidian-git:push";
const GIT_LIST_CHANGED_COMMAND_ID = "obsidian-git:list-changed-files";
const GIT_BACKUP_SYNC_CLOSE_COMMAND_ID = "obsidian-git:backup-and-close";

// Helper function to check if a file is within a specific folder path
function isFileInFolder(file: TFile, folderPath: string): boolean {
  const normalizedFilePath = file.path.replace(/\\/g, '/');
  const normalizedFolderPath = folderPath.replace(/\\/g, '/');

  if (normalizedFolderPath === '/' || normalizedFolderPath === '') return true;

  const folderPrefix = normalizedFolderPath.endsWith('/') ? normalizedFolderPath : normalizedFolderPath + '/';
  return normalizedFilePath.startsWith(folderPrefix);
}

function getWordCount(text: string, ignoreContractions: boolean): number {
	let cleanedText = text;
	if (ignoreContractions) {
		cleanedText = text.replace(/('|’)(s|d|ll|ve|re|m|t)\b/gi, "");
	}
	const pattern = /[\p{L}\p{N}–-]+/gu;
	return (cleanedText.match(pattern) || []).length;
}

function getCharacterCount(text: string): number {
  return text.length;
}

function getCharOccurrences(text: string, char: string): number {
  // Use a regex for counting to handle potential special characters in `char`
  const regex = new RegExp(char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
  return (text.match(regex) || []).length;
}

// --- Custom View Class ---
// Define the custom view class
class CustomView extends ItemView {
  plugin: CustomViewPlugin;
  wordCountDisplayEl: HTMLElement;
  propertiesDisplayEl: HTMLElement;
  quotesDisplayEl: HTMLElement;

  constructor(leaf: WorkspaceLeaf, plugin: CustomViewPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string { return CUSTOM_GIT_VIEW_TYPE; }
  getDisplayText(): string { return "Editor Summary"; }
  getIcon(): string { return 'star'; }

  async onOpen(): Promise<void> {
    const contentContainer = this.containerEl.children[1];
    contentContainer.empty();
    contentContainer.addClass('git-actions-view-container');

    const iconButtonContainer = contentContainer.createDiv({ cls: 'git-action-icon-button-group' });
    this.createIconButtons(iconButtonContainer);

    contentContainer.createEl('h4', { text: 'Word Count', cls: 'properties-title' });

    this.wordCountDisplayEl = contentContainer.createEl('div', { cls: 'word-count-display' });
    this.quotesDisplayEl = contentContainer.createEl('div', { cls: 'quotes-display' });

    contentContainer.createEl('h4', { text: 'Active File Properties', cls: 'properties-title' });
    this.propertiesDisplayEl = contentContainer.createEl('div', { cls: 'properties-display' });

    this.plugin.updateViews(); // Initial population
  }

  private createIconButtons(container: HTMLElement) {
    const syncCloseButton = container.createEl('div', { 
        cls: 'clickable-icon git-action-icon-button mod-warning'
    });
    syncCloseButton.innerHTML = SYNC_CLOSE_ICON;
    syncCloseButton.setAttribute('aria-label', 'Backup, Sync and Close App');
    this.registerDomEvent(syncCloseButton, 'click', () => {
        this.plugin.executeGitCommand(GIT_BACKUP_SYNC_CLOSE_COMMAND_ID, 'Attempting to commit, sync, and close...', 'Error executing Git Backup/Sync/Close.');
    });

    const createButton = (icon: string, ariaLabel: string, commandId: string, noticeMsg: string, errorMsg: string) => {
      const button = container.createEl('div', { cls: 'clickable-icon git-action-icon-button' });
      button.innerHTML = icon;
      button.setAttribute('aria-label', ariaLabel);
      this.registerDomEvent(button, 'click', () => {
        this.plugin.executeGitCommand(commandId, noticeMsg, errorMsg);
      });
    };

    //createButton(SYNC_CLOSE_ICON, 'Backup, Sync and Close App', GIT_BACKUP_SYNC_CLOSE_COMMAND_ID, 'Attempting to commit, sync, and close...', 'Error executing Git Backup/Sync/Close.');
    createButton(GIT_COMMIT_SYNC_ICON, 'Git Commit and Sync', GIT_COMMIT_SYNC_COMMAND_ID, 'Attempting Git Commit and Sync...', 'Error executing Git Commit and Sync.');
    createButton(PULL_ICON, 'Git Pull', GIT_PULL_COMMAND_ID, 'Attempting Git Pull...', 'Error executing Git Pull.');
    createButton(LIST_CHANGED_ICON, 'List Changed Files', GIT_LIST_CHANGED_COMMAND_ID, 'Attempting to list Git changes...', 'Error listing Git changes.');
    
    const openNoteButton = container.createEl('div', { cls: 'clickable-icon git-action-icon-button' });
    openNoteButton.innerHTML = FILE_CHANGE_ICON;
    openNoteButton.setAttribute('aria-label', 'Open Latest Chapter');
    this.registerDomEvent(openNoteButton, 'click', () => this.plugin.openFirstNoteWithProperty());
  }
  
  updateWordCountDisplay(textCount: string) {
    if (this.wordCountDisplayEl) this.wordCountDisplayEl.innerHTML = textCount;
  }

  updateQuotesDisplay(singleCount: number, doubleCount: number) {
    if (!this.quotesDisplayEl) return;
    this.quotesDisplayEl.empty();

    if (!this.plugin.settings.showQuotesModule) {
      return;
    }

    const container = this.quotesDisplayEl.createDiv({ cls: 'quotes-analysis-container' });
    container.createEl('h4', { text: 'Quotes Analysis', cls: 'properties-title' });

    // --- Button Group ---
    const buttonGroup = container.createDiv({ cls: 'quote-button-group' });

    const replaceSingleBtn = buttonGroup.createDiv({
      cls: 'clickable-icon git-action-icon-button custom-border-button single-quote-button', // Re-use existing button style
      attr: { 'aria-label': 'Replace Single Quotes' }
    });
    replaceSingleBtn.innerHTML = SINGLE_QUOTE_ICON;
    this.registerDomEvent(replaceSingleBtn, 'mousedown', () => {
      this.plugin.replaceQuotes('single');
    });

    const replaceDoubleBtn = buttonGroup.createDiv({
      cls: 'clickable-icon git-action-icon-button custom-border-button', // Re-use existing button style
      attr: { 'aria-label': 'Replace Double Quotes' }
    });
    replaceDoubleBtn.innerHTML = DOUBLE_QUOTE_ICON;
    this.registerDomEvent(replaceDoubleBtn, 'mousedown', () => {
      this.plugin.replaceQuotes('double');
    });

    // --- Counter Group ---
    const counterGroup = container.createDiv({ cls: 'quote-counter-group' });
    counterGroup.createDiv({
      cls: 'quote-counter-item',
      text: `Single Quotes ('): ${singleCount}`
    });
    counterGroup.createDiv({
      cls: 'quote-counter-item',
      text: `Double Quotes ("): ${doubleCount}`
    });
  }

  updatePropertiesDisplay(properties: any) {
    if (!this.propertiesDisplayEl) return;
    this.propertiesDisplayEl.empty();

    if (properties && typeof properties === 'object' && Object.keys(properties).length > 0) {
      const list = this.propertiesDisplayEl.createEl('ul', { cls: 'properties-list' });
      for (const key in properties) {
        if (Object.prototype.hasOwnProperty.call(properties, key) && key !== 'position') {
          const value = properties[key];
          const listItem = list.createEl('li');
          listItem.createEl('strong', { text: `${key}: ` });

          const valueContainer = listItem.createSpan();
          const values = Array.isArray(value) ? value : [value];

          values.forEach((val, index) => {
            const valStr = String(val);
            const linkRegex = /\[\[(.*?)\]\]/g;
            let lastIndex = 0;
            let match;

            while ((match = linkRegex.exec(valStr)) !== null) {
              if (match.index > lastIndex) valueContainer.appendText(valStr.substring(lastIndex, match.index));
              
              const fullLinkText = match[1]; // This is "path/path2/filename.md|Name" or "just/a/path.md"
              
              // Determine the display text and the actual path for the link
              let displayText: string;
              let linkPath: string;
              
              const pipeIndex = fullLinkText.indexOf('|');
              if (pipeIndex !== -1) {
                  linkPath = fullLinkText.substring(0, pipeIndex);
                  displayText = fullLinkText.substring(pipeIndex + 1);
              } else {
                  linkPath = fullLinkText;
                  displayText = fullLinkText;
              }

              const linkEl = valueContainer.createEl('a', { text: displayText, href: '#', cls: 'internal-link' });
              
              // The event handler should open the clean path
              this.registerDomEvent(linkEl, 'mousedown', (evt: MouseEvent) => {
                // evt.button === 2 is the right-click, 1 is middle-click
                if (evt.button === 2 || evt.button === 1) {
                  // Prevent the default browser context menu from appearing
                  evt.preventDefault();
                  // Open the link in a new tab/leaf. The 'true' at the end does this.
                  this.plugin.app.workspace.openLinkText(linkPath, '', true);
                }
                // 0 is left-click
                else if (evt.button === 0) {
                  evt.preventDefault();
                  // Open the link in the last active main editor pane.
                  this.plugin.openLinkInMainEditor(linkPath);
                }
              });

              lastIndex = linkRegex.lastIndex;
            }

            if (lastIndex < valStr.length) valueContainer.appendText(valStr.substring(lastIndex));
            if (index < values.length - 1) valueContainer.appendText(', ');
          });
        }
      }
    } else {
      this.propertiesDisplayEl.setText('No properties found in this file.');
    }
  }
}

// --- Main Plugin Class ---
export default class CustomViewPlugin extends Plugin {
  statusBarItemEl: HTMLElement | null = null;
  settings: CustomViewPluginSettings;
  
  private lastActiveEditorLeaf: WorkspaceLeaf | null = null;
  private cachedViewData: {
    wordCountText: string,
    properties: any,
    statusBarText: string,
    singleQuoteCount: number,
    doubleQuoteCount: number,
  } | null = null;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new CustomViewPluginSettingsTab(this.app, this));

    if (this.settings.showInStatusBar) this.createStatusBarItem();
    
    this.registerView(CUSTOM_GIT_VIEW_TYPE, (leaf) => new CustomView(leaf, this));

    this.addCommand({ id: 'open-custom-view', name: 'Open Custom View', callback: () => this.activateView() });
    this.addRibbonIcon('star', 'Open Custom View', () => this.activateView());
    
    this.registerEvent(this.app.workspace.on('active-leaf-change', leaf => {
        // If the new active leaf is a markdown editor, update the last known editor leaf
        if (leaf?.view instanceof MarkdownView) {
            this.lastActiveEditorLeaf = leaf;
        }
        this.calculateAndUpdate();
    }));
    
    this.registerEvent(this.app.workspace.on('editor-change', (editor, info) => {
        // Only trigger updates if the active view is a markdown editor
        if (info.file && this.app.workspace.getActiveViewOfType(MarkdownView)) {
            this.calculateAndUpdate();
        }
    }));

    this.registerDomEvent(document, 'selectionchange', debounce(() => {
      if (this.app.workspace.getActiveViewOfType(MarkdownView)) {
          this.calculateAndUpdate();
      }
    }, 200)); // Use of a 200ms debounce to avoid excessive updates

    // Initial load
    if (this.app.workspace.getActiveViewOfType(MarkdownView)) {
        this.lastActiveEditorLeaf = this.app.workspace.activeLeaf;
    }
    this.calculateAndUpdate();
  }

  onunload() {
    this.statusBarItemEl?.remove();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    if (this.settings.showInStatusBar && !this.statusBarItemEl) this.createStatusBarItem();
    else if (!this.settings.showInStatusBar && this.statusBarItemEl) this.removeStatusBarItem();
    this.calculateAndUpdate();
  }
  
  createStatusBarItem() { this.statusBarItemEl = this.addStatusBarItem(); }
  removeStatusBarItem() { this.statusBarItemEl?.remove(); this.statusBarItemEl = null; }

  async calculateAndUpdate() {
    const activeMdView = this.app.workspace.getActiveViewOfType(MarkdownView);
  
    if (activeMdView && activeMdView.file) {
      const editor = activeMdView.editor;
      const file = activeMdView.file;
      const isSelection = editor.somethingSelected();
      let contentToCount = isSelection ? editor.getSelection() : editor.getValue();
      const source: 'selection' | 'file' = isSelection ? 'selection' : 'file';
      const fileCache = this.app.metadataCache.getFileCache(file);
      const properties = fileCache?.frontmatter;

      // Only process whole-file exclusions if not counting a selection
      if (!isSelection) {
        if (this.settings.ignoreFrontmatter && contentToCount.startsWith('---')) {
          const secondDashIndex = contentToCount.indexOf('---', 3);
          if (secondDashIndex !== -1) {
            const endOfProperties = contentToCount.indexOf('\n', secondDashIndex);
            contentToCount = endOfProperties !== -1 ? contentToCount.substring(endOfProperties + 1) : '';
          }
        }
        if (this.settings.marker && this.settings.marker.length > 0) {
          const markerIndex = contentToCount.indexOf(this.settings.marker);
          if (markerIndex !== -1) {
            contentToCount = contentToCount.substring(markerIndex + this.settings.marker.length);
          } else if (!this.settings.contAllContentIfNoMarker) {
            contentToCount = '';
          }
        }
        if (this.settings.ignoreMarkdownComments) {
          contentToCount = contentToCount.replace(/%%[\s\S]*?%%/g, '');
        }
      }

      const charCount = getCharacterCount(contentToCount);
      const wordCount = getWordCount(contentToCount, this.settings.ignoreContractions);
      const pageCount = (wordCount / this.settings.wordsPerPage).toFixed(2);
      const sourceIndicator = source === 'selection' ? 'Selected ' : 'Total ';
      const singleQuoteCount = getCharOccurrences(contentToCount, "'");
      const doubleQuoteCount = getCharOccurrences(contentToCount, '"');

      // Cache the new data
      this.cachedViewData = {
        wordCountText: `${sourceIndicator}Chars: ${charCount}<br>${sourceIndicator}Words: ${wordCount}<br>${sourceIndicator}Pages: ${pageCount}`,
        properties: properties,
        statusBarText: `${sourceIndicator}Chars: ${charCount} | Words: ${wordCount} | Pages: ${pageCount}`,
        singleQuoteCount,
        doubleQuoteCount,
      };
    }
  
    this.updateViews();
  }

updateViews() {
    const data = this.cachedViewData; // Assign data to a local constant
    if (data) {
      // If data exists, update all views with it
      if (this.statusBarItemEl) {
        this.statusBarItemEl.innerHTML = data.statusBarText;
      }
      this.app.workspace.getLeavesOfType(CUSTOM_GIT_VIEW_TYPE).forEach(leaf => {
        if (leaf.view instanceof CustomView) {
          leaf.view.updateWordCountDisplay(data.wordCountText);
          leaf.view.updatePropertiesDisplay(data.properties);
          leaf.view.updateQuotesDisplay(data.singleQuoteCount, data.doubleQuoteCount);
        }
      });
    } else {
      // If there's no data, clear all views
      if (this.statusBarItemEl) this.statusBarItemEl.innerHTML = '';
      this.app.workspace.getLeavesOfType(CUSTOM_GIT_VIEW_TYPE).forEach(leaf => {
        if (leaf.view instanceof CustomView) {
          leaf.view.updateWordCountDisplay(`Chars: 0<br>Words: 0<br>Pages: 0.00`);
          leaf.view.updatePropertiesDisplay(null);
          leaf.view.updateQuotesDisplay(0, 0);
        }
      });
    }
  }

  public openLinkInMainEditor(linkText: string): void {
    // Use the last active editor leaf if it's still available
    const targetLeaf = this.lastActiveEditorLeaf && this.lastActiveEditorLeaf.view ? 
                       this.lastActiveEditorLeaf : 
                       this.app.workspace.getLeaf(true); // Fallback to a new leaf
    
    if (targetLeaf) {
      this.app.workspace.setActiveLeaf(targetLeaf);
      this.app.workspace.openLinkText(linkText, '', false);
    }
  }

  async activateView() {
    let leaf = this.app.workspace.getLeavesOfType(CUSTOM_GIT_VIEW_TYPE)[0];
    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(false) ?? this.app.workspace.getLeaf('split', 'vertical');
      await leaf.setViewState({ type: CUSTOM_GIT_VIEW_TYPE, active: true });
    }
    this.app.workspace.revealLeaf(leaf);
  }

  async openFirstNoteWithProperty() {
    const { targetFolderPath, propertyName, propertyValues } = this.settings;
    if (!targetFolderPath || !propertyName || !propertyValues) {
      new Notice('Please configure all note opening settings.'); return;
    }
    const allowedValues = propertyValues.split(',').map(v => v.trim()).filter(Boolean);
    if (allowedValues.length === 0) {
      new Notice('Please specify at least one Allowed Property Value.'); return;
    }
    const matchingFiles = this.app.vault.getMarkdownFiles().filter(file => {
      if (!isFileInFolder(file, targetFolderPath)) return false;
      const propValue = this.app.metadataCache.getFileCache(file)?.frontmatter?.[propertyName];
      if (propValue === undefined) return false;
      return Array.isArray(propValue) ? propValue.some(v => allowedValues.includes(String(v).trim())) : allowedValues.includes(String(propValue).trim());
    }).sort((a, b) => a.path.localeCompare(b.path));

    if (matchingFiles.length > 0) {
      this.openLinkInMainEditor(matchingFiles[0].path);
    } else {
      new Notice(`No notes found with the specified criteria.`);
    }
  }

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
  }

async replaceQuotes(quoteType: 'single' | 'double') {
    const targetView = this.lastActiveEditorLeaf?.view as MarkdownView;

    if (!targetView) {
      new Notice('No editor selected. Please click into a note before replacing quotes.');
      return;
    }

    const editor = targetView.editor;
    const isSelection = editor.somethingSelected();

    // This is the function that will perform the replacement
    const performReplacement = (text: string): string => {
        if (quoteType === 'single') {
            // Replacing with a right single quote/apostrophe is a strong heuristic.
            return text.replace(/'/g, '’');
        } else {
            // For double quotes, we alternate between opening and closing.
            let isOpening = true;
            return text.replace(/"/g, () => {
                if (isOpening) {
                    isOpening = false;
                    return '“'; // Opening double quote
                } else {
                    isOpening = true;
                    return '”'; // Closing double quote
                }
            });
        }
    };

    if (isSelection) {
      const selection = editor.getSelection();
      const replacedSelection = performReplacement(selection);

      if (selection !== replacedSelection) {
        editor.replaceSelection(replacedSelection);
        new Notice(`Replaced quotes in selection.`);
      } else {
        new Notice(`No matching quotes found in selection.`);
      }
    } else {
      // Replace in the whole "countable" area
      const originalContent = editor.getValue();
      let startIndex = 0;

      // Logic to find the start of the countable content, mirroring calculateAndUpdate
      if (this.settings.ignoreFrontmatter && originalContent.startsWith('---')) {
        const secondDashIndex = originalContent.indexOf('---', 3);
        if (secondDashIndex !== -1) {
          const endOfProperties = originalContent.indexOf('\n', secondDashIndex);
          if (endOfProperties !== -1) {
            startIndex = endOfProperties + 1;
          }
        }
      }
      if (this.settings.marker && this.settings.marker.length > 0) {
        const markerIndex = originalContent.indexOf(this.settings.marker, startIndex);
        if (markerIndex !== -1) {
          startIndex = markerIndex + this.settings.marker.length;
        } else if (!this.settings.contAllContentIfNoMarker) {
          new Notice('Marker not found. Nothing to replace.');
          return;
        }
      }

      const prefix = originalContent.substring(0, startIndex);
      const body = originalContent.substring(startIndex);
      const newBody = performReplacement(body);

      if (body !== newBody) {
        editor.setValue(prefix + newBody);
        new Notice(`Replaced quotes in the document.`);
      } else {
        new Notice(`No matching quotes found in the document body.`);
      }
    }
    // The editor-change event will trigger calculateAndUpdate automatically
  }
}