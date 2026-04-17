Pod::Spec.new do |s|
  s.name         = 'PapyrusNativeEngine'
  s.version      = '0.2.12'
  s.summary      = 'Papyrus Native Engine (PDFKit)'
  s.homepage     = 'https://solrachix.github.io/Papyrus/'
  s.license      = { :type => 'MIT' }
  s.author       = { 'Papyrus SDK' => 'https://github.com/solrachix/Papyrus' }
  s.platforms    = { :ios => '13.0' }
  s.source       = { :git => 'https://github.com/solrachix/Papyrus.git', :tag => s.version.to_s }
  s.source_files = '**/*.{h,m,mm,swift}'
  s.requires_arc = true
  s.swift_version = '5.0'

  s.dependency 'React-Core'
end
