const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
class ProjectCreatorProvider {
  constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    
    // Initialize storage
    try {
      // Only initialize storage if workspace storage path exists
      if (vscode.workspace.storagePath) {
        this.storagePath = vscode.Uri.file(
          path.join(vscode.workspace.storagePath, 'love2d-project-creator')
        );
        fs.mkdirSync(this.storagePath.fsPath, { recursive: true });
        console.log('Storage initialized at:', this.storagePath.fsPath);
      } else {
        console.log('No workspace storage path available - continuing without persistent storage');
        this.storagePath = null;
      }
    } catch (error) {
      console.error('Error initializing storage:', error.message);
      // Continue without storage if initialization fails
      this.storagePath = null;
    }
  }

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element) {
    return element;
  }

  getChildren(element) {
    if (element) {
      return [];
    }

    const items = [];
    
    // Add Create New Project button
    const createItem = new vscode.TreeItem('Create New Project', vscode.TreeItemCollapsibleState.None);
    createItem.command = {
      command: 'love2d-project-creator.createProject',
      title: 'Create New Project'
    };
    createItem.tooltip = 'Create a new Love2D project';
    createItem.iconPath = new vscode.ThemeIcon('add');
    createItem.contextValue = 'createProjectButton';
    items.push(createItem);

    // Add existing projects
    const config = vscode.workspace.getConfiguration('love2dProjectCreator');
    let defaultLocation = config.get('defaultLocation');
    
    if (defaultLocation) {
      // Expand ~ to home directory
      if (defaultLocation.startsWith('~')) {
        defaultLocation = path.join(process.env.HOME, defaultLocation.slice(1));
      }
      
      if (fs.existsSync(defaultLocation)) {
        const projects = fs.readdirSync(defaultLocation, { withFileTypes: true })
          .filter(dirent => dirent.isDirectory())
          .map(dirent => {
            const projectPath = path.join(defaultLocation, dirent.name);
            return {
              name: dirent.name,
              path: projectPath,
              mtime: fs.statSync(projectPath).mtime
            };
          })
          .sort((a, b) => b.mtime - a.mtime) // Sort by modification time, newest first
          .map(project => {
            const projectItem = new vscode.TreeItem(project.name, vscode.TreeItemCollapsibleState.None);
            projectItem.command = {
              command: 'love2d-project-creator.openProject',
              title: 'Open Project',
              arguments: [project.path]
            };
            projectItem.tooltip = `Open ${project.name} project`;
            projectItem.iconPath = null;
            projectItem.contextValue = 'projectItem';
            projectItem.resourceUri = vscode.Uri.file(project.path);
            const projectPath = project.path;
            console.log('Setting delete button arguments:', projectPath);
            projectItem.buttons = [
              {
                // iconPath: new vscode.ThemeIcon('notebook-delete-cell'),//"assets/delete.svg"
                tooltip: 'Delete Project',
                command: {  // Wrap in command object
                  title: 'Delete Project',
                  command: 'love2d-project-creator.deleteProject',
                  tooltip: 'Delete Project',
                  arguments: [vscode.Uri.file(projectPath)]
                }
              },
              {
                // iconPath: "assets/find.svg",
                tooltip: 'Reveal in Finder',
                command: {  // Wrap in command object
                  title: 'Reveal in Finder',
                  command: 'love2d-project-creator.revealInFinder',
                  tooltip: 'Reveal in Finder',
                  arguments: [projectItem]
                }
              }
            ];
            return projectItem;
          });
        
        items.push(...projects);
      }
    }

    return items;
  }
}

function activate(context) {
  // Register the project creator provider
  const projectCreatorProvider = new ProjectCreatorProvider();
  vscode.window.registerTreeDataProvider(
    'love2d-project-creator.view',
    projectCreatorProvider
  );

  // Register the create project command
  let disposable = vscode.commands.registerCommand('love2d-project-creator.createProject', async function () {
    const projectName = await vscode.window.showInputBox({
      prompt: 'Enter project name',
      placeHolder: 'MyLove2DProject'
    });

    if (!projectName) return;

    const config = vscode.workspace.getConfiguration('love2dProjectCreator');
    let defaultLocation = config.get('defaultLocation');
    
    let projectPath;
    if (defaultLocation) {
      // Expand ~ to home directory
      if (defaultLocation.startsWith('~')) {
        defaultLocation = path.join(process.env.HOME, defaultLocation.slice(1));
      }
      
      if (fs.existsSync(defaultLocation)) {
        projectPath = [vscode.Uri.file(defaultLocation)];
      } else {
        projectPath = await vscode.window.showOpenDialog({
          canSelectFiles: false,
          canSelectFolders: true,
          canSelectMany: false,
          openLabel: 'Select project location'
        });
        
        if (!projectPath) return;
      }
    } else {
      projectPath = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Select project location'
      });
      
      if (!projectPath) return;
    }

    const fullPath = path.join(projectPath[0].fsPath, projectName);

    try {
      // Create project directory
      fs.mkdirSync(fullPath);

      // Create main.lua
      fs.writeFileSync(path.join(fullPath, 'main.lua'), `
if os.getenv("LOCAL_LUA_DEBUGGER_VSCODE") == "1" then
  require("lldebugger").start()
end

function love.load()
    -- Initialize game
end

function love.update(dt)
    -- Update game state
end

function love.draw()
    -- Draw game
end`);

      // Create conf.lua
      fs.writeFileSync(path.join(fullPath, 'conf.lua'), `function love.conf(t)
    t.window.title = "${projectName}"
    t.window.width = 800
    t.window.height = 600
end`);

      // Copy template folder if configured
      const templatePath = config.get('templatePath');
      if (templatePath && fs.existsSync(templatePath)) {
        try {
          fs.cpSync(templatePath, fullPath, { recursive: true });
          vscode.window.showInformationMessage(`Template copied from ${templatePath}`);
        } catch (error) {
          vscode.window.showErrorMessage(`Error copying template: ${error.message}`);
        }
      }

      // Open project in VSCode
      vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(fullPath));

      vscode.window.showInformationMessage(`Love2D project '${projectName}' created successfully!`);
    } catch (error) {
      vscode.window.showErrorMessage(`Error creating project: ${error.message}`);
    }
  });

  // Register the open project command
  let openDisposable = vscode.commands.registerCommand('love2d-project-creator.openProject', function (projectPath) {
    vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(projectPath));
  });

  // Register the delete project command
  let deleteDisposable = vscode.commands.registerCommand('love2d-project-creator.deleteProject', async function (treeItem) {
    // Extract path from TreeItem's resourceUri
    const projectPath = treeItem?.resourceUri?.fsPath;
    
    console.log('Delete command received treeItem:', treeItem);
    console.log('Extracted projectPath:', projectPath);
    
    if (!projectPath || typeof projectPath !== 'string') {
      vscode.window.showErrorMessage(`Invalid project path: ${projectPath}`);
      return;
    }
    
    // Normalize and validate path
    const normalizedPath = path.normalize(projectPath);
    if (!fs.existsSync(normalizedPath)) {
      vscode.window.showErrorMessage(`Project path does not exist: ${normalizedPath}`);
      return;
    }
    
    // Ensure path is a directory
    if (!fs.lstatSync(normalizedPath).isDirectory()) {
      vscode.window.showErrorMessage(`Path is not a directory: ${normalizedPath}`);
      return;
    }

    const confirm = await vscode.window.showWarningMessage(
      `Are you sure you want to delete ${path.basename(projectPath)}? This action cannot be undone.`,
      { modal: true },
      'Delete'
    );
    
    if (confirm === 'Delete') {
      try {
        fs.rmdirSync(projectPath, { recursive: true });
        vscode.window.showInformationMessage(`Project ${path.basename(projectPath)} deleted successfully`);
        vscode.commands.executeCommand('love2d-project-creator.refresh');
      } catch (error) {
        vscode.window.showErrorMessage(`Error deleting project: ${error.message}`);
      }
    }
  });

  // Register the reveal project command
  let revealDisposable = vscode.commands.registerCommand('love2d-project-creator.revealInFinder', function (treeItem) {
    // Extract path from TreeItem's resourceUri
    const projectPath = treeItem?.resourceUri?.fsPath;
    
    if (!projectPath || typeof projectPath !== 'string') {
      vscode.window.showErrorMessage(`Invalid project path: ${projectPath}`);
      return;
    }
    
    // Normalize and validate path
    const normalizedPath = path.normalize(projectPath);
    if (!fs.existsSync(normalizedPath)) {
      vscode.window.showErrorMessage(`Project path does not exist: ${normalizedPath}`);
      return;
    }
    
    // Ensure path is a directory
    if (!fs.lstatSync(normalizedPath).isDirectory()) {
      vscode.window.showErrorMessage(`Path is not a directory: ${normalizedPath}`);
      return;
    }

    try {
      vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(projectPath));
    } catch (error) {
      vscode.window.showErrorMessage(`Error revealing project: ${error.message}`);
    }
  });

  // Register the refresh command
  let refreshDisposable = vscode.commands.registerCommand('love2d-project-creator.refresh', () => {
    projectCreatorProvider.refresh();
  });

  context.subscriptions.push(disposable, openDisposable, deleteDisposable, revealDisposable, refreshDisposable);
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
}
