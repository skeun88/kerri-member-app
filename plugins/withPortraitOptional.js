/**
 * Expo config plugin: android.hardware.screen.portrait를 optional로 설정
 * Google Play Console 경고: "필수 하드웨어 기능 선언으로 인해 앱의 사용 가능 여부가 제한됨" 해소
 */
const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withPortraitOptional(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const mainApplication = manifest.manifest;

    if (!mainApplication['uses-feature']) {
      mainApplication['uses-feature'] = [];
    }

    const features = mainApplication['uses-feature'];

    // android.hardware.screen.portrait가 이미 있으면 optional로 변경, 없으면 추가
    const portraitFeature = features.find(
      (f) => f.$?.['android:name'] === 'android.hardware.screen.portrait'
    );

    if (portraitFeature) {
      portraitFeature.$['android:required'] = 'false';
    } else {
      features.push({
        $: {
          'android:name': 'android.hardware.screen.portrait',
          'android:required': 'false',
        },
      });
    }

    return config;
  });
};
