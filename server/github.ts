import * as process from "node:process";

export interface GitHubUser {
  id: number;
  login: string;
  email: string;
  name: string;
  avatar_url: string;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  owner: {
    login: string;
    avatar_url: string;
  };
  description: string;
  updated_at: string;
}

export interface GitHubBranch {
  name: string;
  commit: {
    sha: string;
  };
}

export interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string;
      date: string;
    };
  };
}

export const githubApi = {
  /**
   * Exchange OAuth authorization code for access token and user info
   */
  async exchangeCodeForToken(code: string): Promise<{ accessToken: string; user: GitHubUser }> {
    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      throw new Error("GitHub OAuth not configured");
    }
    
    const redirectUri = process.env.GITHUB_REDIRECT_URI;
    
    // Exchange code for access token
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });
    
    const tokenData = await tokenResponse.json();
    
    if (!tokenData.access_token) {
      console.error("GitHub token exchange failed:", tokenData);
      throw new Error(`Failed to get access token: ${tokenData.error_description || tokenData.error || 'Unknown error'}`);
    }
    
    // Get user info
    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        "Authorization": `token ${tokenData.access_token}`,
        "Accept": "application/vnd.github.v3+json",
      },
    });
    
    const user = await userResponse.json();
    
    // Get user email if not public
    if (!user.email) {
      const emailResponse = await fetch("https://api.github.com/user/emails", {
        headers: {
          "Authorization": `token ${tokenData.access_token}`,
          "Accept": "application/vnd.github.v3+json",
        },
      });
      
      const emails = await emailResponse.json();
      const primaryEmail = emails.find((email: any) => email.primary);
      user.email = primaryEmail?.email || '';
    }
    
    return {
      accessToken: tokenData.access_token,
      user,
    };
  },

  async getUserRepos(accessToken: string): Promise<GitHubRepo[]> {
    const response = await fetch("https://api.github.com/user/repos?sort=updated&per_page=50", {
      headers: {
        "Authorization": `token ${accessToken}`,
        "Accept": "application/vnd.github.v3+json",
      },
    });
    
    if (!response.ok) {
      throw new Error("Failed to fetch repositories");
    }
    
    return await response.json();
  },

  async getRepoBranches(repo: string, accessToken: string): Promise<GitHubBranch[]> {
    const response = await fetch(`https://api.github.com/repos/${repo}/branches`, {
      headers: {
        "Authorization": `token ${accessToken}`,
        "Accept": "application/vnd.github.v3+json",
      },
    });
    
    if (!response.ok) {
      throw new Error("Failed to fetch branches");
    }
    
    return await response.json();
  },

  async getLatestCommit(repo: string, branch: string, accessToken: string): Promise<{
    sha: string;
    message: string;
    author: string;
    date: Date;
  }> {
    const response = await fetch(`https://api.github.com/repos/${repo}/commits/${branch}`, {
      headers: {
        "Authorization": `token ${accessToken}`,
        "Accept": "application/vnd.github.v3+json",
      },
    });
    
    if (!response.ok) {
      throw new Error("Failed to fetch latest commit");
    }
    
    const commit: GitHubCommit = await response.json();
    
    return {
      sha: commit.sha,
      message: commit.commit.message,
      author: commit.commit.author.name,
      date: new Date(commit.commit.author.date),
    };
  },
};
