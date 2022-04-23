import path from 'path';

import {
  ConnectorMetadata,
  GetAccessToken,
  GetAuthorizationUri,
  ValidateConfig,
  GetUserInfo,
  ConnectorError,
  ConnectorErrorCodes,
  SocialConnector,
  GetConnectorConfig,
  GetTimeout,
} from '@logto/connector-types';
import { getMarkdownContents } from '@logto/connector-utils';
import { ConnectorType } from '@logto/schemas';
import { assert } from '@silverhand/essentials';
import got, { RequestError as GotRequestError } from 'got';
import { stringify } from 'query-string';
import { z } from 'zod';

import { authorizationEndpoint, accessTokenEndpoint, scope, userInfoEndpoint } from './constant';

// eslint-disable-next-line unicorn/prefer-module
const currentPath = __dirname;
const pathToReadmeFile = path.join(currentPath, 'README.md');
const pathToConfigTemplate = path.join(currentPath, 'config-template.md');
const readmeContentFallback = 'Please check README.md file directory.';
const configTemplateFallback = 'Please check config-template.md file directory.';

const githubConfigGuard = z.object({
  clientId: z.string(),
  clientSecret: z.string(),
});

export type GithubConfig = z.infer<typeof githubConfigGuard>;

export class GithubConnector implements SocialConnector {
  public metadata: ConnectorMetadata = {
    id: 'github',
    type: ConnectorType.Social,
    name: {
      en: 'Sign In with GitHub',
      'zh-CN': 'GitHub登录',
    },
    logo: 'https://user-images.githubusercontent.com/5717882/156983224-7ea0296b-38fa-419d-9515-67e8a9612e09.png',
    description: {
      en: 'Sign In with GitHub',
      'zh-CN': 'GitHub登录',
    },
    readme: getMarkdownContents(pathToReadmeFile, readmeContentFallback),
    configTemplate: getMarkdownContents(pathToConfigTemplate, configTemplateFallback),
  };

  public readonly getConfig: GetConnectorConfig<GithubConfig>;
  public readonly getRequestTimeout: GetTimeout;

  constructor(
    getConnectorConfig: GetConnectorConfig<GithubConfig>,
    getConnectorRequestTimeout: GetTimeout
  ) {
    this.getConfig = getConnectorConfig;
    this.getRequestTimeout = getConnectorRequestTimeout;
  }

  public validateConfig: ValidateConfig = async (config: unknown) => {
    const result = githubConfigGuard.safeParse(config);

    if (!result.success) {
      throw new ConnectorError(ConnectorErrorCodes.InvalidConfig, result.error.message);
    }
  };

  public getAuthorizationUri: GetAuthorizationUri = async (redirectUri, state) => {
    const config = await this.getConfig(this.metadata.id);

    return `${authorizationEndpoint}?${stringify({
      client_id: config.clientId,
      redirect_uri: redirectUri,
      state,
      scope, // Only support fixed scope for v1.
    })}`;
  };

  getAccessToken: GetAccessToken = async (code) => {
    type AccessTokenResponse = {
      access_token: string;
      scope: string;
      token_type: string;
    };

    const { clientId: client_id, clientSecret: client_secret } = await this.getConfig(
      this.metadata.id
    );

    const { access_token: accessToken } = await got
      .post({
        url: accessTokenEndpoint,
        json: {
          client_id,
          client_secret,
          code,
        },
        timeout: await this.getRequestTimeout(),
      })
      .json<AccessTokenResponse>();

    assert(accessToken, new ConnectorError(ConnectorErrorCodes.SocialAuthCodeInvalid));

    return { accessToken };
  };

  public getUserInfo: GetUserInfo = async (accessTokenObject) => {
    type UserInfoResponse = {
      id: number;
      avatar_url?: string;
      email?: string;
      name?: string;
    };

    const { accessToken } = accessTokenObject;

    try {
      const {
        id,
        avatar_url: avatar,
        email,
        name,
      } = await got
        .get(userInfoEndpoint, {
          headers: {
            authorization: `token ${accessToken}`,
          },
          timeout: await this.getRequestTimeout(),
        })
        .json<UserInfoResponse>();

      return {
        id: String(id),
        avatar,
        email,
        name,
      };
    } catch (error: unknown) {
      if (error instanceof GotRequestError && error.response?.statusCode === 401) {
        throw new ConnectorError(ConnectorErrorCodes.SocialAccessTokenInvalid);
      }
      throw error;
    }
  };
}
