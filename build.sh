#!/bin/bash
set -e

echo "🌟 Building Orb.app..."

# Check Node is installed
if ! command -v node &> /dev/null; then
  echo "❌ Node.js not found. Install from: https://nodejs.org"
  exit 1
fi

echo "📦 Installing dependencies..."
npm install

echo "🖼  Building icon..."
if command -v iconutil &> /dev/null; then
  iconutil -c icns assets/icon.iconset -o assets/icon.icns
  echo "  ✓ icon.icns created"
else
  echo "  ℹ Using PNG icon fallback"
fi

echo "🔨 Building app..."
npm run build:dmg

echo ""
echo "✅ Done! Find Orb.dmg in the dist/ folder."
echo "   Open it and drag Orb to Applications."
