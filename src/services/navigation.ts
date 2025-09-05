import { Config, DeepLink } from "../types.js";

/**
 * Service for generating Grafana navigation deeplinks
 */
export class NavigationService {
  private baseUrl: string;

  constructor(config: Config) {
    this.baseUrl = config.GRAFANA_URL.replace(/\/$/, ""); // Remove trailing slash
  }

  /**
   * Generate a deeplink URL
   */
  generateDeepLink(options: {
    type: "dashboard" | "panel" | "explore";
    dashboardUid?: string;
    panelId?: number;
    datasourceUid?: string;
    from?: string;
    to?: string;
    refresh?: string;
    vars?: Record<string, string>;
    query?: string;
    left?: Record<string, any>;
    right?: Record<string, any>;
  }): DeepLink {
    const {
      type,
      dashboardUid,
      panelId,
      datasourceUid,
      from,
      to,
      refresh,
      vars,
      query,
      left,
      right,
    } = options;

    let path = "";
    let title = "";
    const params = new URLSearchParams();

    switch (type) {
      case "dashboard":
        if (!dashboardUid) {
          throw new Error("dashboardUid is required for dashboard links");
        }
        path = `/d/${dashboardUid}`;
        title = `Dashboard ${dashboardUid}`;

        if (panelId) {
          params.set("viewPanel", panelId.toString());
          title += ` - Panel ${panelId}`;
        }
        break;

      case "panel":
        if (!dashboardUid || !panelId) {
          throw new Error(
            "dashboardUid and panelId are required for panel links",
          );
        }
        path = `/d/${dashboardUid}`;
        params.set("viewPanel", panelId.toString());
        title = `Panel ${panelId} in Dashboard ${dashboardUid}`;
        break;

      case "explore":
        path = "/explore";
        title = "Explore";

        if (datasourceUid) {
          const exploreParams: Record<string, any> = {
            datasource: datasourceUid,
          };

          if (query) {
            exploreParams.expr = query;
          }

          params.set("left", JSON.stringify(exploreParams));
        }

        if (left) {
          params.set("left", JSON.stringify(left));
        }

        if (right) {
          params.set("right", JSON.stringify(right));
        }
        break;

      default:
        throw new Error(`Unsupported link type: ${type}`);
    }

    // Add time range parameters
    if (from) {
      params.set("from", from);
    }
    if (to) {
      params.set("to", to);
    }

    // Add refresh parameter
    if (refresh) {
      params.set("refresh", refresh);
    }

    // Add dashboard variables
    if (vars) {
      Object.entries(vars).forEach(([key, value]) => {
        params.set(`var-${key}`, value);
      });
    }

    // Construct final URL
    const queryString = params.toString();
    const url = `${this.baseUrl}${path}${queryString ? `?${queryString}` : ""}`;

    return {
      url,
      type,
      title,
    };
  }

  /**
   * Generate dashboard deeplink
   */
  generateDashboardLink(
    dashboardUid: string,
    options?: {
      panelId?: number;
      from?: string;
      to?: string;
      refresh?: string;
      vars?: Record<string, string>;
    },
  ): DeepLink {
    return this.generateDeepLink({
      type: "dashboard",
      dashboardUid,
      ...options,
    });
  }

  /**
   * Generate panel deeplink
   */
  generatePanelLink(
    dashboardUid: string,
    panelId: number,
    options?: {
      from?: string;
      to?: string;
      refresh?: string;
      vars?: Record<string, string>;
    },
  ): DeepLink {
    return this.generateDeepLink({
      type: "panel",
      dashboardUid,
      panelId,
      ...options,
    });
  }

  /**
   * Generate explore deeplink
   */
  generateExploreLink(
    datasourceUid: string,
    options?: {
      query?: string;
      from?: string;
      to?: string;
      refresh?: string;
      queryType?: string;
      leftPaneOptions?: Record<string, any>;
      rightPaneOptions?: Record<string, any>;
    },
  ): DeepLink {
    const {
      query,
      queryType,
      leftPaneOptions,
      rightPaneOptions,
      ...timeOptions
    } = options || {};

    const left = {
      datasource: datasourceUid,
      ...(query && { expr: query }),
      ...(queryType && { queryType }),
      ...leftPaneOptions,
    };

    return this.generateDeepLink({
      type: "explore",
      datasourceUid,
      left,
      right: rightPaneOptions,
      ...timeOptions,
    });
  }

  /**
   * Generate explore link with Prometheus query
   */
  generatePrometheusExploreLink(
    datasourceUid: string,
    query: string,
    options?: {
      from?: string;
      to?: string;
      refresh?: string;
      step?: string;
      range?: boolean;
    },
  ): DeepLink {
    const { range = true, step, ...timeOptions } = options || {};

    const leftPaneOptions: Record<string, any> = {
      expr: query,
      queryType: "",
      ...(range && { range: true }),
      ...(step && { step }),
    };

    return this.generateExploreLink(datasourceUid, {
      leftPaneOptions,
      ...timeOptions,
    });
  }

  /**
   * Generate explore link with Loki query
   */
  generateLokiExploreLink(
    datasourceUid: string,
    query: string,
    options?: {
      from?: string;
      to?: string;
      refresh?: string;
    },
  ): DeepLink {
    const leftPaneOptions = {
      expr: query,
      queryType: "",
    };

    return this.generateExploreLink(datasourceUid, {
      leftPaneOptions,
      ...options,
    });
  }

  /**
   * Generate link to alerts page
   */
  generateAlertsLink(): DeepLink {
    return {
      url: `${this.baseUrl}/alerting/list`,
      type: "dashboard", // Generic type
      title: "Alerts",
    };
  }

  /**
   * Generate link to specific alert rule
   */
  generateAlertRuleLink(ruleUid: string): DeepLink {
    return {
      url: `${this.baseUrl}/alerting/${ruleUid}/view`,
      type: "dashboard", // Generic type
      title: `Alert Rule ${ruleUid}`,
    };
  }

  /**
   * Generate link to datasources page
   */
  generateDatasourcesLink(): DeepLink {
    return {
      url: `${this.baseUrl}/datasources`,
      type: "dashboard", // Generic type
      title: "Datasources",
    };
  }

  /**
   * Generate link to specific datasource
   */
  generateDatasourceLink(datasourceUid: string): DeepLink {
    return {
      url: `${this.baseUrl}/datasources/edit/${datasourceUid}`,
      type: "dashboard", // Generic type
      title: `Datasource ${datasourceUid}`,
    };
  }

  /**
   * Generate link to teams page
   */
  generateTeamsLink(): DeepLink {
    return {
      url: `${this.baseUrl}/org/teams`,
      type: "dashboard", // Generic type
      title: "Teams",
    };
  }

  /**
   * Generate link to specific team
   */
  generateTeamLink(teamId: number): DeepLink {
    return {
      url: `${this.baseUrl}/org/teams/edit/${teamId}`,
      type: "dashboard", // Generic type
      title: `Team ${teamId}`,
    };
  }

  /**
   * Generate link to users page
   */
  generateUsersLink(): DeepLink {
    return {
      url: `${this.baseUrl}/admin/users`,
      type: "dashboard", // Generic type
      title: "Users",
    };
  }

  /**
   * Generate link to specific user
   */
  generateUserLink(userId: number): DeepLink {
    return {
      url: `${this.baseUrl}/admin/users/edit/${userId}`,
      type: "dashboard", // Generic type
      title: `User ${userId}`,
    };
  }

  /**
   * Generate link to specific folder
   */
  generateFolderLink(folderUid: string): DeepLink {
    return {
      url: `${this.baseUrl}/dashboards/f/${folderUid}`,
      type: "dashboard", // Generic type
      title: `Folder ${folderUid}`,
    };
  }

  /**
   * Parse relative time strings to absolute timestamps
   */
  parseTimeRange(from: string, to = "now"): { from: string; to: string } {
    const now = Date.now();

    const parseTime = (time: string): string => {
      if (time === "now") {
        return now.toString();
      }

      // Handle relative times like "now-1h", "now-24h", etc.
      const relativeMatch = time.match(/^now-(\d+)([smhdwMy])$/);
      if (relativeMatch) {
        const value = parseInt(relativeMatch[1]);
        const unit = relativeMatch[2];

        let milliseconds = 0;
        switch (unit) {
          case "s":
            milliseconds = value * 1000;
            break;
          case "m":
            milliseconds = value * 60 * 1000;
            break;
          case "h":
            milliseconds = value * 60 * 60 * 1000;
            break;
          case "d":
            milliseconds = value * 24 * 60 * 60 * 1000;
            break;
          case "w":
            milliseconds = value * 7 * 24 * 60 * 60 * 1000;
            break;
          case "M":
            milliseconds = value * 30 * 24 * 60 * 60 * 1000;
            break;
          case "y":
            milliseconds = value * 365 * 24 * 60 * 60 * 1000;
            break;
        }

        return (now - milliseconds).toString();
      }

      // If it's already a timestamp or absolute time, return as-is
      return time;
    };

    return {
      from: parseTime(from),
      to: parseTime(to),
    };
  }

  /**
   * Validate time range
   */
  validateTimeRange(
    from: string,
    to: string,
  ): { isValid: boolean; error?: string } {
    try {
      const parsed = this.parseTimeRange(from, to);
      const fromTime = parseInt(parsed.from);
      const toTime = parseInt(parsed.to);

      if (isNaN(fromTime) || isNaN(toTime)) {
        return { isValid: false, error: "Invalid time format" };
      }

      if (fromTime >= toTime) {
        return { isValid: false, error: "From time must be before to time" };
      }

      return { isValid: true };
    } catch (_error) {
      return { isValid: false, error: "Failed to parse time range" };
    }
  }

  /**
   * Get common time range presets
   */
  getTimeRangePresets(): Array<{ label: string; from: string; to: string }> {
    return [
      { label: "Last 5 minutes", from: "now-5m", to: "now" },
      { label: "Last 15 minutes", from: "now-15m", to: "now" },
      { label: "Last 30 minutes", from: "now-30m", to: "now" },
      { label: "Last 1 hour", from: "now-1h", to: "now" },
      { label: "Last 3 hours", from: "now-3h", to: "now" },
      { label: "Last 6 hours", from: "now-6h", to: "now" },
      { label: "Last 12 hours", from: "now-12h", to: "now" },
      { label: "Last 24 hours", from: "now-24h", to: "now" },
      { label: "Last 2 days", from: "now-2d", to: "now" },
      { label: "Last 7 days", from: "now-7d", to: "now" },
      { label: "Last 30 days", from: "now-30d", to: "now" },
      { label: "Last 90 days", from: "now-90d", to: "now" },
      { label: "Last 6 months", from: "now-6M", to: "now" },
      { label: "Last 1 year", from: "now-1y", to: "now" },
      { label: "Last 2 years", from: "now-2y", to: "now" },
      { label: "Last 5 years", from: "now-5y", to: "now" },
    ];
  }
}
