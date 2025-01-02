#!/bin/bash

# Function to increment version
increment_version() {
  local version=$1
  local parts=(${version//./ })
  parts[2]=$((parts[2] + 1))
  echo "${parts[0]}.${parts[1]}.${parts[2]}"
}

# Get current version from package.json
current_version=$(awk -F'"' '/"version":/ {print $4}' package.json)
if [[ -z "$current_version" ]]; then
  echo "Error: Could not find version in package.json"
  exit 1
fi

new_version=$(increment_version $current_version)

# Update package.json with new version (macOS compatible sed)
sed -i '' "s/\"version\": \"$current_version\"/\"version\": \"$new_version\"/" package.json
echo "Version updated from $current_version to $new_version"

# Install vsce if not already installed
if ! command -v vsce &> /dev/null
then
    echo "Installing vsce..."
    npm install -g @vscode/vsce
fi

# Install dependencies
echo "Installing dependencies..."
npm install

# Create build directory if it doesn't exist
if [ ! -d "build" ]; then
  echo "Creating build directory..."
  mkdir build
fi

# Package the extension (suppress deprecation warnings)
echo "Packaging extension..."
NODE_NO_WARNINGS=1 vsce package

# Install immediately after building if --install flag is set
if [[ "$1" == "--install" ]]; then
  # Get the just-built .vsix file
  just_built_vsix=$(ls -t *.vsix | head -n1)
  if [[ -n "$just_built_vsix" ]]; then
    echo "Installing just-built extension..."
    code --install-extension "$just_built_vsix" --force
    echo "Extension installation complete!"
  else
    echo "Error: Could not find just-built .vsix file"
    exit 1
  fi
fi

# Move the .vsix file to build directory
mv *.vsix build/

echo "Build complete! The .vsix file is ready in the build directory."
