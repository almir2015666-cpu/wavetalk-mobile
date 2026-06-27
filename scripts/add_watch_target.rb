#!/usr/bin/env ruby
# Adds WaveTalkWatch (watchOS app) target to the Expo-generated Xcode project.
# Run AFTER expo prebuild and pod install.

require 'xcodeproj'
require 'fileutils'

WATCH_NAME       = 'WaveTalkWatch'
WATCH_BUNDLE_ID  = 'com.wavetalk.app.watchkitapp'
WATCHOS_MIN      = '7.0'
PROJECT_PATH     = Dir.glob('ios/*.xcodeproj').first
WATCH_SRC        = File.expand_path('watchapp/WaveTalkWatch')
NATIVE_SRC       = File.expand_path('watchapp/native')
IOS_DIR          = 'ios'
WATCH_IOS_DIR    = "#{IOS_DIR}/#{WATCH_NAME}"

abort "No .xcodeproj found in ios/" unless PROJECT_PATH
project = Xcodeproj::Project.open(PROJECT_PATH)

# ── Skip if already added ─────────────────────────────────────────────────────
if project.targets.any? { |t| t.name == WATCH_NAME }
  puts "Watch target already exists — skipping"
  exit 0
end

# ── Copy source files ─────────────────────────────────────────────────────────
FileUtils.cp_r(WATCH_SRC, IOS_DIR) unless File.exist?(WATCH_IOS_DIR)

# Copy native module files to main iOS target directory
native_dest = "#{IOS_DIR}/#{WATCH_NAME}NativeModule"
FileUtils.mkdir_p(native_dest)
Dir.glob("#{NATIVE_SRC}/*").each { |f| FileUtils.cp(f, native_dest) }

# ── Create Watch App target ───────────────────────────────────────────────────
watch_target = project.new_target(:watch2_app, WATCH_NAME, :watchos, WATCHOS_MIN)

# ── Source files group ────────────────────────────────────────────────────────
main_group  = project.main_group
watch_group = main_group.new_group(WATCH_NAME, WATCH_IOS_DIR)

swift_files = Dir.glob("#{WATCH_IOS_DIR}/*.swift").map do |f|
  ref = watch_group.new_reference(File.basename(f))
  ref.set_explicit_file_type('sourcecode.swift')
  ref.source_tree = '<group>'
  ref
end

watch_target.add_file_references(swift_files)

# Assets
assets_path = "#{WATCH_IOS_DIR}/Assets.xcassets"
FileUtils.mkdir_p(assets_path) unless File.exist?(assets_path)
assets_ref = watch_group.new_reference('Assets.xcassets')
assets_ref.last_known_file_type = 'folder.assetcatalog'
assets_ref.source_tree = '<group>'
watch_target.resources_build_phase.add_file_reference(assets_ref)

# ── Build settings ────────────────────────────────────────────────────────────
watch_target.build_configurations.each do |cfg|
  cfg.build_settings['PRODUCT_BUNDLE_IDENTIFIER']    = WATCH_BUNDLE_ID
  cfg.build_settings['PRODUCT_NAME']                 = WATCH_NAME
  cfg.build_settings['SWIFT_VERSION']                = '5.0'
  cfg.build_settings['WATCHOS_DEPLOYMENT_TARGET']    = WATCHOS_MIN
  cfg.build_settings['TARGETED_DEVICE_FAMILY']       = '4'
  cfg.build_settings['SDKROOT']                      = 'watchos'
  cfg.build_settings['SUPPORTED_PLATFORMS']          = 'watchos watchsimulator'
  cfg.build_settings['SUPPORTS_MACCATALYST']         = 'NO'
  cfg.build_settings['LD_RUNPATH_SEARCH_PATHS']      = ['@executable_path/Frameworks']
  cfg.build_settings['ASSETCATALOG_COMPILER_APPICON_NAME'] = 'AppIcon'
  cfg.build_settings['ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES'] = 'YES'
  cfg.build_settings['CODE_SIGN_STYLE']              = 'Automatic'
end

# ── Link WatchKit.framework ───────────────────────────────────────────────────
watchkit = project.frameworks_group.new_reference('WatchKit.framework')
watchkit.last_known_file_type = 'wrapper.framework'
watchkit.source_tree = 'SDKROOT'
watchkit.path = 'System/Library/Frameworks/WatchKit.framework'
watch_target.frameworks_build_phase.add_file_reference(watchkit)

# ── Add native module files to main app target ────────────────────────────────
main_target = project.targets.find { |t| t.name == 'WaveTalk' }
if main_target
  native_group = main_group['WaveTalkWatch'] || main_group.new_group('WatchNativeModule', native_dest)
  Dir.glob("#{native_dest}/*").each do |f|
    ref = native_group.new_reference(File.basename(f))
    ext = File.extname(f)
    if ext == '.swift' || ext == '.m' || ext == '.h'
      ref.source_tree = '<group>'
      main_target.add_file_references([ref]) if ext == '.swift' || ext == '.m'
    end
  end
end

# ── Save ──────────────────────────────────────────────────────────────────────
project.save
puts "✓ WaveTalkWatch target added to #{PROJECT_PATH}"
