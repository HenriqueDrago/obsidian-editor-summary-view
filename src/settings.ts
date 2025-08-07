import { App, PluginSettingTab, Setting } from "obsidian";
import CustomViewPlugin from "src/main"
// Define the plugin settings interface
export interface CustomViewPluginSettings {
ignoreContractions: boolean;
ignoreMarkdownComments: boolean;
ignoreFrontmatter: boolean; 
showInStatusBar: boolean; 
wordsPerPage: number;
marker: string;
contAllContentIfNoMarker: boolean;
targetFolderPath: string;
propertyName: string;
propertyValues: string; // Comma-separated string of allowed values
showQuotesModule: boolean;
}

// Define the default settings
export const DEFAULT_SETTINGS: CustomViewPluginSettings = {
ignoreContractions: true, // Default to ignoring contractions
ignoreMarkdownComments: true, // Default to ignoring markdown comments
ignoreFrontmatter: true, // Default to ignoring frontmatter
showInStatusBar: true, // Default to showing in status bar
wordsPerPage: 300, // Default words per page
marker: "", // Default marker
contAllContentIfNoMarker: true, // Default to count all content if no marker found
targetFolderPath: "/", // Default to root
propertyName: "", // Default property name
propertyValues: "", // Default allowed values
showQuotesModule: true, // Default to showing quotes module
}

// Create a setting tab for the plugin
export class CustomViewPluginSettingsTab extends PluginSettingTab {
    plugin: CustomViewPlugin;
  
    constructor(app: App, plugin: CustomViewPlugin) {
      super(app, plugin);
      this.plugin = plugin;
    }
  
    display(): void {
        const { containerEl } = this;

        containerEl.empty(); // Clear the container

        containerEl.createEl('h2', { text: 'Editor Summary Plugin Settings' });

        // --- Word Count Settings ---
        containerEl.createEl('h3', { text: 'Word Count Configuration' });

        // Setting for Words per Page
        new Setting(containerEl)
        .setName('Words per page')
        .setDesc('Set the number of words to consider as one page.')
        .addText(text => text
            .setValue(this.plugin.settings.wordsPerPage.toString())
            .setPlaceholder(DEFAULT_SETTINGS.wordsPerPage.toString())
            .onChange(async (value) => {
            const numValue = parseInt(value);
            if (!isNaN(numValue) && numValue > 0) {
                this.plugin.settings.wordsPerPage = numValue;
                await this.plugin.saveSettings();
            } else {
                // Optionally provide user feedback for invalid input
                console.warn('Invalid input for Words per page. Please enter a positive number.');
                // Or reset to the last valid value or default
                text.setValue(this.plugin.settings.wordsPerPage.toString());
            }
            }));


        // Add a toggle for ignoring contractions
        new Setting(containerEl)
        .setName('Ignore contractions')
        .setDesc('Toggle to exclude common contractions (e.g., \'s, \'d, \'ll) from the word count.')
        .addToggle(toggle => toggle
            .setValue(this.plugin.settings.ignoreContractions)
            .onChange(async (value) => {
            this.plugin.settings.ignoreContractions = value;
            await this.plugin.saveSettings(); // Save settings when the toggle changes
            }));

        // Add a toggle for ignoring markdown comments
        new Setting(containerEl)
            .setName('Ignore markdown comments')
            .setDesc('Toggle to exclude content between %% lines from the count.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.ignoreMarkdownComments)
                .onChange(async (value) => {
                    this.plugin.settings.ignoreMarkdownComments = value;
                    await this.plugin.saveSettings();
                }));

        // Add a toggle for ignoring frontmatter
        new Setting(containerEl)
            .setName('Ignore frontmatter')
            .setDesc('Toggle to exclude the properties section (between --- lines at the top) from the count.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.ignoreFrontmatter)
                .onChange(async (value) => {
                    this.plugin.settings.ignoreFrontmatter = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
        .setName('Marker')
        .setDesc('Enter the string that marks the beginning of the content for word count.')
        .addText(text => text
            .setPlaceholder('Enter your marker')
            .setValue(this.plugin.settings.marker)
            .onChange(async (value) => {
                this.plugin.settings.marker = value;
                await this.plugin.saveSettings(); // Save settings when the value changes
            }));
        
        // Setting for showing in status bar
        new Setting(containerEl)
        .setName('Count all if there is no marker')
        .setDesc('Toggle to count the entire note if marker is set but not found.')
        .addToggle(toggle => toggle
            .setValue(this.plugin.settings.contAllContentIfNoMarker)
            .onChange(async (value) => {
                this.plugin.settings.contAllContentIfNoMarker = value;
                await this.plugin.saveSettings();
            }));

        // Setting for showing in status bar
        new Setting(containerEl)
            .setName('Show in status bar')
            .setDesc('Toggle to show or hide the word count in the status bar.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showInStatusBar)
                .onChange(async (value) => {
                    this.plugin.settings.showInStatusBar = value;
                    await this.plugin.saveSettings();
                }));

    // --- Quotes Analysis Settings ---
    new Setting(containerEl)
        .setName('Show quotes analysis module')
        .setDesc('Toggle to show or hide the single and double quotes counter and replacer in the custom view.')
        .addToggle(toggle => toggle
            .setValue(this.plugin.settings.showQuotesModule)
            .onChange(async (value) => {
                this.plugin.settings.showQuotesModule = value;
                await this.plugin.saveSettings();
                this.plugin.updateViews(); // Force a view update to show/hide the module
            }));

    // --- Note Opening Settings ---
    containerEl.createEl('h3', { text: 'Note Opening Configuration' });

    new Setting(containerEl)
      .setName('Target Folder Path')
      .setDesc('Enter the folder path to search for notes to open. Use "/" for the entire vault.')
      .addText(text => text
        .setPlaceholder('/')
        .setValue(this.plugin.settings.targetFolderPath)
        .onChange(async (value) => {
          this.plugin.settings.targetFolderPath = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Property Name')
      .setDesc('Enter the name of the property to check in note frontmatter.')
      .addText(text => text
        .setPlaceholder(DEFAULT_SETTINGS.propertyName)
        .setValue(this.plugin.settings.propertyName)
        .onChange(async (value) => {
          this.plugin.settings.propertyName = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Allowed Property Values')
      .setDesc('Enter a comma-separated list of values for the property. The note\'s property value must match one of these.')
      .addText(text => text
        .setPlaceholder(DEFAULT_SETTINGS.propertyValues)
        .setValue(this.plugin.settings.propertyValues)
        .onChange(async (value) => {
          this.plugin.settings.propertyValues = value;
          await this.plugin.saveSettings();
        }));        
    
    }
  }
  