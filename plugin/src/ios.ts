import {
  withAppDelegate,
  withDangerousMod,
  withEntitlementsPlist,
  withInfoPlist,
  withXcodeProject,
  type ConfigPlugin,
} from "@expo/config-plugins";
import * as NseUtils from "./utils/nse";
import * as XcodeUtils from "./utils/xcode";
import { mergeContents } from "./utils/files";
import {
  APP_DELEGATE_ANCHORS,
  APP_GROUPS_KEY,
  BACKGROUND_MODES,
  PUSH_NOTIFICATIONS_ENTITLEMENT_KEY,
} from "./utils/constants";
import type { PluginProps } from "./utils/schema";

const withNsePluginIos: ConfigPlugin<PluginProps> = (config, props) => {
  config = withPushNotificationsEntitlement(config, props);
  config = withBackgroundModes(config, props);
  config = withAppGroup(config, props);
  config = withRemoteNotificationsDelegate(config, props);
  config = withNseTarget(config, props);

  return config;
};

// This probably should not matter much, as following the Expo Notifications docs: "The iOS APNs entitlement is always set to 'development'. Xcode automatically changes this to 'production' during the archive."
// https://docs.expo.dev/versions/latest/sdk/notifications/#configurable-properties
// But still, they use it and expose it there, so we should probably do the same.
const withPushNotificationsEntitlement: ConfigPlugin<PluginProps> = (
  config,
  { mode }
) => {
  return withEntitlementsPlist(config, (config) => {
    if (!config.modResults[PUSH_NOTIFICATIONS_ENTITLEMENT_KEY]) {
      config.modResults[PUSH_NOTIFICATIONS_ENTITLEMENT_KEY] = mode;
    }
    return config;
  });
};

const withBackgroundModes: ConfigPlugin<PluginProps> = (
  config,
  { backgroundModes }
) => {
  const { fetch, remoteNotifications } = backgroundModes;
  if (!fetch && !remoteNotifications) {
    return config;
  }

  return withInfoPlist(config, (config) => {
    if (!Array.isArray(config.modResults.UIBackgroundModes)) {
      config.modResults.UIBackgroundModes = [];
    }
    if (
      remoteNotifications &&
      !config.modResults.UIBackgroundModes.includes(
        BACKGROUND_MODES.REMOTE_NOTIFICATION
      )
    ) {
      config.modResults.UIBackgroundModes.push(
        BACKGROUND_MODES.REMOTE_NOTIFICATION
      );
    }
    if (
      fetch &&
      !config.modResults.UIBackgroundModes.includes(BACKGROUND_MODES.FETCH)
    ) {
      config.modResults.UIBackgroundModes.push(BACKGROUND_MODES.FETCH);
    }

    return config;
  });
};

const withAppGroup: ConfigPlugin<PluginProps> = (config, { appGroup }) => {
  if (!appGroup) return config;

  return withEntitlementsPlist(config, (config) => {
    if (!Array.isArray(config.modResults[APP_GROUPS_KEY])) {
      config.modResults[APP_GROUPS_KEY] = [];
    }

    if (!config.modResults[APP_GROUPS_KEY].includes(appGroup)) {
      config.modResults[APP_GROUPS_KEY].push(appGroup);
    }

    return config;
  });
};

const withRemoteNotificationsDelegate: ConfigPlugin<PluginProps> = (
  config,
  { appDelegate }
) => {
  if (!appDelegate?.remoteNotificationsDelegate) return config;
  const { remoteNotificationsDelegate, imports } = appDelegate;

  return withAppDelegate(config, (config) => {
    if (imports && !config.modResults.contents.includes(imports)) {
      config.modResults.contents = mergeContents({
        tag: "REMOTE_NOTIFICATIONS_DELEGATE_IMPORTS",
        anchor: APP_DELEGATE_ANCHORS.IMPORTS,
        src: config.modResults.contents,
        newSrc: imports,
        comment: "//",
      });
    }

    if (!config.modResults.contents.includes(remoteNotificationsDelegate)) {
      config.modResults.contents = mergeContents({
        tag: "REMOTE_NOTIFICATIONS_DELEGATE_CODE",
        anchor: APP_DELEGATE_ANCHORS.REMOTE_NOTIFICATION_DELEGATE,
        src: config.modResults.contents,
        newSrc: remoteNotificationsDelegate,
        comment: "//",
      });
    }

    return config;
  });
};

const withNseTarget: ConfigPlugin<PluginProps> = (
  config,
  { nse, appGroup }
) => {
  const { bundleName, hFilePath, mFilePath } = nse;

  config = withDangerousMod(config, [
    "ios",
    (config) => {
      NseUtils.copyHeaderFile(
        config.modRequest.projectRoot,
        bundleName,
        hFilePath
      );
      NseUtils.copyImplementationFile(
        config.modRequest.projectRoot,
        bundleName,
        mFilePath
      );

      NseUtils.generateInfoPlist(
        config.modRequest.projectRoot,
        bundleName,
        config.ios?.buildNumber
      );
      NseUtils.generateEntitlements(
        config.modRequest.projectRoot,
        bundleName,
        appGroup
      );

      return config;
    },
  ]);

  config = withXcodeProject(config, (config) => {
    const project = config.modResults;
    if (project.pbxTargetByName(bundleName)) {
      return config;
    }

    const appBundleIdentifier = config.ios?.bundleIdentifier;
    if (!appBundleIdentifier) {
      throw new Error(
        "You must provide an `ios.bundleIdentifier` of your app in your app config."
      );
    }

    const groupId = XcodeUtils.createPbxGroup(project, bundleName);
    XcodeUtils.addGroupToMainProject(project, groupId);

    const targetId = XcodeUtils.createTarget(
      project,
      bundleName,
      appBundleIdentifier
    );
    XcodeUtils.addBuildPhases(project, targetId);
    XcodeUtils.configureBuildSettings(project, bundleName, config.name);

    return config;
  });

  return config;
};

export default withNsePluginIos;
