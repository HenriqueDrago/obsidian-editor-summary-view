import {
	Plugin,
	WorkspaceLeaf,
	Notice,
	ItemView,
	TFile,
	MarkdownView,
	debounce,
} from "obsidian";
import {
	PULL_ICON,
	SYNC_CLOSE_ICON,
	LIST_CHANGED_ICON,
	GIT_COMMIT_SYNC_ICON,
	FILE_CHANGE_ICON,
	SINGLE_QUOTE_ICON,
	DOUBLE_QUOTE_ICON,
} from "src/constants";
import {
	CustomViewPluginSettingsTab,
	CustomViewPluginSettings,
	DEFAULT_SETTINGS,
} from "src/settings";

// Define the constant for the custom view type
const CUSTOM_GIT_VIEW_TYPE = "git-actions-view";

// Define command IDs from the Obsidian Git plugin
const GIT_PULL_COMMAND_ID = "obsidian-git:pull";
const GIT_COMMIT_SYNC_COMMAND_ID = "obsidian-git:push";
const GIT_LIST_CHANGED_COMMAND_ID = "obsidian-git:list-changed-files";
const GIT_BACKUP_SYNC_CLOSE_COMMAND_ID = "obsidian-git:backup-and-close";

// Helper function to check if a file is within a specific folder path
function isFileInFolder(file: TFile, folderPath: string): boolean {
	const normalizedFilePath = file.path.replace(/\\/g, "/"); // Normalize file path to use forward slashes
	const normalizedFolderPath = folderPath.replace(/\\/g, "/"); // Normalize folder path to use forward slashes

	// If the folder path is the root or empty, all files are considered to be in that folder
	if (normalizedFolderPath === "/" || normalizedFolderPath === "")
		return true;

	// Check if the file path starts with the folder path
	const folderPrefix = normalizedFolderPath.endsWith("/")
		? normalizedFolderPath
		: normalizedFolderPath + "/";
	return normalizedFilePath.startsWith(folderPrefix);
}

// Function to count words in a text
function getWordCount(text: string, ignoreContractions: boolean): number {
	let cleanedText = text;
  // If ignoreContractions is true, remove common contractions
	if (ignoreContractions) {
		cleanedText = text.replace(/('|’)(s|d|ll|ve|re|m|t)\b/gi, "");
	}
  // Use a regex pattern to match words, including letters, numbers, and dashes
	const pattern = /[\p{L}\p{N}–-]+/gu;
  // Return the count of matches found in the cleaned text
  // That means, the number of words
	return (cleanedText.match(pattern) || []).length;
}

// Function to count characters in a text
function getCharacterCount(text: string): number {
	return text.length;
}

// Function to count occurrences of a specific character in a text
function getCharOccurrences(text: string, char: string): number {
	// Use a regex for counting to handle potential special characters in `char`
	const regex = new RegExp(char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
	return (text.match(regex) || []).length;
}

// --- Custom View Class ---
// Define the custom view class
class CustomView extends ItemView {
	plugin: CustomViewPlugin; // Reference to the main plugin instance
	wordCountDisplayEl: HTMLElement; // Element to display word count
	propertiesDisplayEl: HTMLElement; // Element to display properties
	quotesDisplayEl: HTMLElement; // Element to display quotes analysis

	constructor(leaf: WorkspaceLeaf, plugin: CustomViewPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

  // Methods required by the ItemView interface
  // Returns the type of the view, which is used to register it
	getViewType(): string {
		return CUSTOM_GIT_VIEW_TYPE;
	}
  // Returns the name of the view, which is displayed in the UI
	getDisplayText(): string {
		return "Editor Summary";
	}
  // Returns the icon for the view, which is displayed in the UI
	getIcon(): string {
		return "star";
	}

  // Called when the view is opened
	async onOpen(): Promise<void> {
		const contentContainer = this.containerEl.children[1]; // Get the content container of the view
		contentContainer.empty(); // Clear any existing content
		contentContainer.addClass("git-actions-view-container"); // Add a custom class for styling

    // Create the header for the view
		const iconButtonContainer = contentContainer.createDiv({
			cls: "git-action-icon-button-group",
		});
    // Create the icon buttons for various Git actions
		this.createIconButtons(iconButtonContainer);

    // Create the main content area for displaying word count, quotes, and properties
		contentContainer.createEl("h4", {
			text: "Word Count",
			cls: "properties-title",
		});

		this.wordCountDisplayEl = contentContainer.createEl("div", {
			cls: "word-count-display",
		});
		this.quotesDisplayEl = contentContainer.createEl("div", {
			cls: "quotes-display",
		});

		contentContainer.createEl("h4", {
			text: "Active File Properties",
			cls: "properties-title",
		});
		this.propertiesDisplayEl = contentContainer.createEl("div", {
			cls: "properties-display",
		});

		this.plugin.updateViews(); // Initial population
	}

  // Creates the icon buttons for various Git actions
  // Each button is associated with a specific Git command and has an event listener for clicks
	private createIconButtons(container: HTMLElement) {
		const syncCloseButton = container.createEl("div", {
			cls: "clickable-icon git-action-icon-button mod-warning",
		});
		syncCloseButton.innerHTML = SYNC_CLOSE_ICON; // Use the constant for the sync/close icon
    // Set the attributes
		syncCloseButton.setAttribute(
			"aria-label",
			"Backup, Sync and Close App"
		);
    // Register the click event for the sync/close button
		this.registerDomEvent(syncCloseButton, "click", () => {
      // Execute the Git command for backup, sync, and close
      // This uses the plugin's method to execute the command with appropriate messages
			this.plugin.executeGitCommand(
				GIT_BACKUP_SYNC_CLOSE_COMMAND_ID,
				"Attempting to commit, sync, and close...",
				"Error executing Git Backup/Sync/Close."
			);
		});

    // Generic function to create a button with an icon, aria-label, command ID, and messages
    // The backup, sync, and close button is created separately above because it has a different style
		const createButton = (
			icon: string,
			ariaLabel: string,
			commandId: string,
			noticeMsg: string,
			errorMsg: string
		) => {
			const button = container.createEl("div", {
				cls: "clickable-icon git-action-icon-button",
			});
			button.innerHTML = icon;
			button.setAttribute("aria-label", ariaLabel);
			this.registerDomEvent(button, "click", () => {
				this.plugin.executeGitCommand(commandId, noticeMsg, errorMsg);
			});
		};

    // Create buttons for other Git actions using the generic function
    createButton(
			GIT_COMMIT_SYNC_ICON,
			"Git Commit and Sync",
			GIT_COMMIT_SYNC_COMMAND_ID,
			"Attempting Git Commit and Sync...",
			"Error executing Git Commit and Sync."
		);
		createButton(
			PULL_ICON,
			"Git Pull",
			GIT_PULL_COMMAND_ID,
			"Attempting Git Pull...",
			"Error executing Git Pull."
		);
		createButton(
			LIST_CHANGED_ICON,
			"List Changed Files",
			GIT_LIST_CHANGED_COMMAND_ID,
			"Attempting to list Git changes...",
			"Error listing Git changes."
		);

    // Create the button to open the latest chapter note
    // This button opens the first note with a specific property, as configured in the plugin
		const openNoteButton = container.createEl("div", {
			cls: "clickable-icon git-action-icon-button",
		});
		openNoteButton.innerHTML = FILE_CHANGE_ICON;
		openNoteButton.setAttribute("aria-label", "Open Latest Chapter");
    // Register the click event for the open note button
		this.registerDomEvent(openNoteButton, "click", () =>
			this.plugin.openFirstNoteWithProperty() // Call the plugin's method to open the first note with the specified property
		);
	}

  // Updates the word count display element with the provided text count
	updateWordCountDisplay(textCount: string) {
		if (this.wordCountDisplayEl)
			this.wordCountDisplayEl.innerHTML = textCount;
	}

  // Updates the quotes display element with the counts of single and double quotes
	updateQuotesDisplay(singleCount: number, doubleCount: number) {
		if (!this.quotesDisplayEl) return; // Ensure the quotes display element exists
		this.quotesDisplayEl.empty(); // Clear any existing content

    // Check if the quotes module is enabled in the plugin settings
		if (!this.plugin.settings.showQuotesModule) {
			return;
		}

    // Create the container for quotes analysis
		const container = this.quotesDisplayEl.createDiv({
			cls: "quotes-analysis-container",
		});
		container.createEl("h4", {
			text: "Quotes Analysis",
			cls: "properties-title",
		});

		// --- Button Group ---
		const buttonGroup = container.createDiv({ cls: "quote-button-group" });

    // Create buttons for replacing single and double quotes
		const replaceSingleBtn = buttonGroup.createDiv({
			cls: "clickable-icon git-action-icon-button custom-border-button single-quote-button",
			attr: { "aria-label": "Replace Single Quotes" },
		});
		replaceSingleBtn.innerHTML = SINGLE_QUOTE_ICON; // Use the constant for the single quote icon
		this.registerDomEvent(replaceSingleBtn, "mousedown", () => {
			this.plugin.replaceQuotes("single"); // Call the plugin's method to replace single quotes
		});

		const replaceDoubleBtn = buttonGroup.createDiv({
			cls: "clickable-icon git-action-icon-button custom-border-button",
			attr: { "aria-label": "Replace Double Quotes" },
		});
		replaceDoubleBtn.innerHTML = DOUBLE_QUOTE_ICON; // Use the constant for the double quote icon
		this.registerDomEvent(replaceDoubleBtn, "mousedown", () => {
			this.plugin.replaceQuotes("double"); // Call the plugin's method to replace double quotes
		});

		// --- Counter Group ---
    // Create a group to display the counts of single and double quotes
		const counterGroup = container.createDiv({
			cls: "quote-counter-group",
		});
		counterGroup.createDiv({
			cls: "quote-counter-item",
			text: `Single Quotes ('): ${singleCount}`,
		});
		counterGroup.createDiv({
			cls: "quote-counter-item",
			text: `Double Quotes ("): ${doubleCount}`,
		});
	}

  // Updates the properties display element with the provided properties object
	updatePropertiesDisplay(properties: any) {
		if (!this.propertiesDisplayEl) return; // Ensure the properties display element exists
		this.propertiesDisplayEl.empty(); // Clear any existing content

    // Check if there are properties to display
		if (
			properties &&
			typeof properties === "object" &&
			Object.keys(properties).length > 0
		) {
      // Create a list to display the properties
			const list = this.propertiesDisplayEl.createEl("ul", {
				cls: "properties-list",
			});

      // Iterate over the properties object and create list items for each property
			for (const key in properties) {
        // Check if the property exists and is not the "position" key
				if (
					Object.prototype.hasOwnProperty.call(properties, key) &&
					key !== "position"
				) {
					const value = properties[key]; // Get the value of the property
					const listItem = list.createEl("li"); // Create a list item for the property
					listItem.createEl("strong", { text: `${key}: ` }); // Create a strong element for the property name

					const valueContainer = listItem.createSpan(); // Create a span to hold the property value
					const values = Array.isArray(value) ? value : [value]; // Ensure value is always an array

          // Iterate over the values and create links for any internal links found
					values.forEach((val, index) => {
						const valStr = String(val); // Convert value to string
            // Regex to find internal links in the format [[path/path2/filename.md|Name]] or [[just/a/path.md]]
						const linkRegex = /\[\[(.*?)\]\]/g;
						let lastIndex = 0;
						let match;

            // Iterate over all matches of the regex in the value string
						while ((match = linkRegex.exec(valStr)) !== null) {
							if (match.index > lastIndex)
                // Append any text before the match
								valueContainer.appendText(
									valStr.substring(lastIndex, match.index)
								);

							const fullLinkText = match[1]; // This is "path/path2/filename.md|Name" or "just/a/path.md"

							// Determine the display text and the actual path for the link
							let displayText: string;
							let linkPath: string;
              
              // Check if the link text contains a pipe character
							const pipeIndex = fullLinkText.indexOf("|");

              // If it does, split the path and display text
							if (pipeIndex !== -1) {
								linkPath = fullLinkText.substring(0, pipeIndex);
								displayText = fullLinkText.substring(
									pipeIndex + 1
								);
              // Otherwise, use the full link text as both path and display text
							} else {
								linkPath = fullLinkText;
								displayText = fullLinkText;
							}

              // Create the link element
							const linkEl = valueContainer.createEl("a", {
								text: displayText,
								href: "#",
								cls: "internal-link",
							});

							// The event handler should open the clean path
							this.registerDomEvent(
								linkEl,
								"mousedown",
								(evt: MouseEvent) => {
									// evt.button === 2 is the right-click, 1 is middle-click
									if (evt.button === 2 || evt.button === 1) {
										// Prevent the default browser context menu from appearing
										evt.preventDefault();
										// Open the link in a new tab/leaf. The 'true' at the end does this.
										this.plugin.app.workspace.openLinkText(
											linkPath,
											"",
											true
										);
									}
									// 0 is left-click
									else if (evt.button === 0) {
										evt.preventDefault();
										// Open the link in the last active main editor pane.
										this.plugin.openLinkInMainEditor(
											linkPath
										);
									}
								}
							);

							lastIndex = linkRegex.lastIndex;
						}

            // Append any remaining text after the last match
						if (lastIndex < valStr.length)
							valueContainer.appendText(
								valStr.substring(lastIndex)
							);
						if (index < values.length - 1)
							valueContainer.appendText(", ");
					});
				}
			}
		} else {
			this.propertiesDisplayEl.setText(
				"No properties found in this file."
			);
		}
	}
}

// --- Main Plugin Class ---
export default class CustomViewPlugin extends Plugin {
	statusBarItemEl: HTMLElement | null = null; // Status bar item element
	settings: CustomViewPluginSettings; // Plugin settings

	private lastActiveEditorLeaf: WorkspaceLeaf | null = null; // Last active editor leaf
	// Cached view data to avoid recalculating on every update
  private cachedViewData: {
		wordCountText: string;
		properties: any;
		statusBarText: string;
		singleQuoteCount: number;
		doubleQuoteCount: number;
	} | null = null;

  // Called when the plugin is loaded
	async onload() {
		await this.loadSettings(); // Load the plugin settings
		this.addSettingTab(new CustomViewPluginSettingsTab(this.app, this)); // Add the settings tab to the plugin

    // If the status bar is enabled in settings, create the status bar item
		if (this.settings.showInStatusBar) this.createStatusBarItem();

    // Register the custom view type with Obsidian  
		this.registerView(
			CUSTOM_GIT_VIEW_TYPE,
			(leaf) => new CustomView(leaf, this)
		);

    // Register the command for opening the custom view
		this.addCommand({
			id: "open-custom-view",
			name: "Open Custom View",
			callback: () => this.activateView(),
		});
    // Add a ribbon icon to open the custom view
		this.addRibbonIcon("star", "Open Custom View", () =>
			this.activateView()
		);

    // Register the command for opening the first note with a specific property
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				// If the new active leaf is a markdown editor, update the last known editor leaf
				if (leaf?.view instanceof MarkdownView) {
					this.lastActiveEditorLeaf = leaf;
				}
				this.calculateAndUpdate(); // Recalculate and update views when the active leaf changes
			})
		);

    // Register an event listener for editor changes
    // This will trigger updates when the editor content changes
		this.registerEvent(
			this.app.workspace.on("editor-change", (editor, info) => {
				// Only trigger updates if the active view is a markdown editor
				if (
					info.file &&
					this.app.workspace.getActiveViewOfType(MarkdownView)
				) {
					this.calculateAndUpdate(); // Recalculate and update views
				}
			})
		);

    // Register a selection change event listener
		this.registerDomEvent(
			document,
			"selectionchange",
			debounce(() => {
				if (this.app.workspace.getActiveViewOfType(MarkdownView)) {
					this.calculateAndUpdate(); // Recalculate and update views on selection change
				}
			}, 200)
		); // Use of a 200ms debounce to avoid excessive updates

		// Initial load
		if (this.app.workspace.getActiveViewOfType(MarkdownView)) {
			this.lastActiveEditorLeaf = this.app.workspace.activeLeaf;
		}
		this.calculateAndUpdate();
	}

  // Called when the plugin is unloaded
	onunload() {
		this.statusBarItemEl?.remove(); // Remove the status bar item if it exists
	}

  // Load the plugin settings from storage
	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

  // Save the plugin settings to storage
	async saveSettings() {
		await this.saveData(this.settings);
    // If the status bar visibility setting has changed, update the status bar item
		if (this.settings.showInStatusBar && !this.statusBarItemEl)
			this.createStatusBarItem();
		else if (!this.settings.showInStatusBar && this.statusBarItemEl)
			this.removeStatusBarItem();
		this.calculateAndUpdate();
	}

  // Create the status bar item if it doesn't exist
	createStatusBarItem() {
		this.statusBarItemEl = this.addStatusBarItem();
	}
  // Remove the status bar item if it exists
	removeStatusBarItem() {
		this.statusBarItemEl?.remove();
		this.statusBarItemEl = null;
	}

  // Calculate and update the word count, character count, and other statistics
	async calculateAndUpdate() {
    // Get the active Markdown view
		const activeMdView =
			this.app.workspace.getActiveViewOfType(MarkdownView);

    // Check if there is an active Markdown view and it has a file
		if (activeMdView && activeMdView.file) {
			const editor = activeMdView.editor; // Get the editor from the active Markdown view
			const file = activeMdView.file; // Get the file associated with the active Markdown view
			const isSelection = editor.somethingSelected(); // Check if there is a selection in the editor

      // If there is a selection, use the selected text; otherwise, use the whole file content
			let contentToCount = isSelection
				? editor.getSelection()
				: editor.getValue();

      // If the content is empty, clear the cached data and update views
			const source: "selection" | "file" = isSelection
				? "selection"
				: "file";

			const fileCache = this.app.metadataCache.getFileCache(file); // Get the file cache for the active file
			const properties = fileCache?.frontmatter; // Get the frontmatter properties of the file

			// Only process whole-file exclusions if not counting a selection
			if (!isSelection) {
        // If the settings specify to ignore frontmatter, remove it from the content
				if (
					this.settings.ignoreFrontmatter &&
					contentToCount.startsWith("---")
				) {
					const secondDashIndex = contentToCount.indexOf("---", 3);
					if (secondDashIndex !== -1) {
						const endOfProperties = contentToCount.indexOf(
							"\n",
							secondDashIndex
						);
						contentToCount =
							endOfProperties !== -1
								? contentToCount.substring(endOfProperties + 1)
								: "";
					}
				}

        // If the settings specify a marker, find it and adjust the content accordingly
				if (this.settings.marker && this.settings.marker.length > 0) {
					const markerIndex = contentToCount.indexOf(
						this.settings.marker
					);
					if (markerIndex !== -1) {
						contentToCount = contentToCount.substring(
							markerIndex + this.settings.marker.length
						);
					} else if (!this.settings.contAllContentIfNoMarker) {
						contentToCount = "";
					}
				}

        // If the settings specify to ignore Markdown comments, remove them from the content
        // Markdown comments are in the format %% comment %%
				if (this.settings.ignoreMarkdownComments) {
					contentToCount = contentToCount.replace(
						/%%[\s\S]*?%%/g,
						""
					);
				}
			}

			const charCount = getCharacterCount(contentToCount); // Get the character count of the content

      // Get the word count
			const wordCount = getWordCount(
				contentToCount,
				this.settings.ignoreContractions
			);

      // Calculate the page count based on the word count and words per page setting
			const pageCount = (wordCount / this.settings.wordsPerPage).toFixed(
				2
			);

      // Prepare the text to display in the word count section
			const sourceIndicator =
				source === "selection" ? "Selected " : "Total ";
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

		this.updateViews(); // Update all views with the new data
	}

  // This method is called to update the views with the latest data
  // It updates the status bar item and all custom views with the cached data
	updateViews() {
		const data = this.cachedViewData; // Assign data to a local constant
		if (data) {
			// If data exists, update all views with it
			if (this.statusBarItemEl) {
				this.statusBarItemEl.innerHTML = data.statusBarText;
			}
			this.app.workspace
				.getLeavesOfType(CUSTOM_GIT_VIEW_TYPE)
				.forEach((leaf) => {
					if (leaf.view instanceof CustomView) {
						leaf.view.updateWordCountDisplay(data.wordCountText);
						leaf.view.updatePropertiesDisplay(data.properties);
						leaf.view.updateQuotesDisplay(
							data.singleQuoteCount,
							data.doubleQuoteCount
						);
					}
				});
		} else {
			// If there's no data, clear all views
			if (this.statusBarItemEl) this.statusBarItemEl.innerHTML = "";
			this.app.workspace
				.getLeavesOfType(CUSTOM_GIT_VIEW_TYPE)
				.forEach((leaf) => {
					if (leaf.view instanceof CustomView) {
						leaf.view.updateWordCountDisplay(
							`Chars: 0<br>Words: 0<br>Pages: 0.00`
						);
						leaf.view.updatePropertiesDisplay(null);
						leaf.view.updateQuotesDisplay(0, 0);
					}
				});
		}
  }
  
  // Method to open a link in the main editor pane
	public openLinkInMainEditor(linkText: string): void {
		// Use the last active editor leaf if it's still available
		const targetLeaf =
			this.lastActiveEditorLeaf && this.lastActiveEditorLeaf.view
				? this.lastActiveEditorLeaf
				: this.app.workspace.getLeaf(true); // Fallback to a new leaf

    // If the target leaf is valid, set it as the active leaf and open the link
		if (targetLeaf) {
			this.app.workspace.setActiveLeaf(targetLeaf);
			this.app.workspace.openLinkText(linkText, "", false);
		}
	}

  // Method to activate the custom view
	async activateView() {
		let leaf = this.app.workspace.getLeavesOfType(CUSTOM_GIT_VIEW_TYPE)[0]; // Get the first leaf of the custom view type

    // If no leaf exists, create a new one
		if (!leaf) {
      // Prioritize the right leaf, or create a new vertical split leaf
			leaf =
				this.app.workspace.getRightLeaf(false) ??
				this.app.workspace.getLeaf("split", "vertical");
			await leaf.setViewState({
				type: CUSTOM_GIT_VIEW_TYPE,
				active: true,
			});
		}
		this.app.workspace.revealLeaf(leaf);
	}

  // Method to open the first note with a specific property value
	async openFirstNoteWithProperty() {
    // Get the settings for the target folder, property name, and allowed values
		const { targetFolderPath, propertyName, propertyValues } =
			this.settings;

    // Validate the settings
		if (!targetFolderPath || !propertyName || !propertyValues) {
			new Notice("Please configure all note opening settings.");
			return;
		}

    // Get the property values and split them into an array
		const allowedValues = propertyValues
			.split(",")
			.map((v) => v.trim())
			.filter(Boolean);

    // Validate the allowed values
		if (allowedValues.length === 0) {
			new Notice("Please specify at least one Allowed Property Value.");
			return;
		}

    // Find all markdown files in the target folder that match the property criteria
		const matchingFiles = this.app.vault
			.getMarkdownFiles()
			.filter((file) => {
				if (!isFileInFolder(file, targetFolderPath)) return false;
				const propValue =
					this.app.metadataCache.getFileCache(file)?.frontmatter?.[
						propertyName
					];
				if (propValue === undefined) return false;
				return Array.isArray(propValue)
					? propValue.some((v) =>
							allowedValues.includes(String(v).trim())
					  )
					: allowedValues.includes(String(propValue).trim());
			})
			.sort((a, b) => a.path.localeCompare(b.path)); // Sort files by path

    // If there are matching files, open the first one in the main editor
		if (matchingFiles.length > 0) {
			this.openLinkInMainEditor(matchingFiles[0].path);
		} else {
			new Notice(`No notes found with the specified criteria.`);
		}
	}

  // Method to execute a Git command by its ID
	async executeGitCommand(
		commandId: string,
		noticeMessage: string,
		errorMessage: string
	): Promise<void> {
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

  // Method to replace quotes in the active editor
	async replaceQuotes(quoteType: "single" | "double") {
		const targetView = this.lastActiveEditorLeaf?.view as MarkdownView; // Get the last active editor view

    // If no active view is found, show a notice to the user
		if (!targetView) {
			new Notice(
				"No editor selected. Please click into a note before replacing quotes."
			);
			return;
		}

		const editor = targetView.editor; // Get the editor from the active Markdown view
		const isSelection = editor.somethingSelected(); // Check if there is a selection in the editor

		// This is the function that will perform the replacement
		const performReplacement = (text: string): string => {
			if (quoteType === "single") {
				// Simple Quotes
				// Replace opening quotes (checks for leading spaces, start of the string and punctuation)
				text = text.replace(/(\s|^|\p{P})'/gu, '$1‘');
				// Replace closing quotes and apostrophes (what remains)
				text = text.replace(/'/g, '’');
				return text;
			} else {
				// Double Quotes
				// Replace opening quotes (checks for leading spaces, start of the string and punctuation)
				text = text.replace(/(\s|^|\p{P})"/gu, '$1“');
				// Replace closing quotes (what remains)
				text = text.replace(/"/g, '”');
				
				return text;
			}
		};

    // If there is a selection, replace quotes only in the selected text
		if (isSelection) {
			const selection = editor.getSelection(); // Get the selected text
      // Perform the replacement on the selected text
			const replacedSelection = performReplacement(selection);

      // If the selection has changed after replacement, replace it in the editor
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
			if (
				this.settings.ignoreFrontmatter &&
				originalContent.startsWith("---")
			) {
				const secondDashIndex = originalContent.indexOf("---", 3);
				if (secondDashIndex !== -1) {
					const endOfProperties = originalContent.indexOf(
						"\n",
						secondDashIndex
					);
					if (endOfProperties !== -1) {
						startIndex = endOfProperties + 1;
					}
				}
			}
			if (this.settings.marker && this.settings.marker.length > 0) {
				const markerIndex = originalContent.indexOf(
					this.settings.marker,
					startIndex
				);
				if (markerIndex !== -1) {
					startIndex = markerIndex + this.settings.marker.length;
				} else if (!this.settings.contAllContentIfNoMarker) {
					new Notice("Marker not found. Nothing to replace.");
					return;
				}
			}

      // Extract the body content starting from the calculated start index
			const prefix = originalContent.substring(0, startIndex);
			const body = originalContent.substring(startIndex);
			const newBody = performReplacement(body); // Perform the replacement on the body content

      // If the body has changed after replacement, update the editor content
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
