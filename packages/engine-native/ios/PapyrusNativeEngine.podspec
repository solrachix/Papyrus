Pod::Spec.new do |s|
  s.name         = 'PapyrusNativeEngine'
  s.version      = '0.1.0'
  s.summary      = 'Papyrus Native Engine (PDFKit)'
  s.homepage     = 'https://example.com/papyrus'
  s.license      = { :type => 'MIT' }
  s.author       = { 'Papyrus' => 'dev@papyrus.local' }
  s.platforms    = { :ios => '13.0' }
  s.source       = { :git => 'https://example.com/papyrus.git', :tag => s.version.to_s }
  s.source_files = '**/*.{h,m,mm,swift}'
  s.requires_arc = true
  s.swift_version = '5.0'

  s.dependency 'React-Core'
end
