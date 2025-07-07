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

export const githubClient = {
  async getUser(accessToken: string): Promise<GitHubUser> {
    const response = await fetch("https://api.github.com/user", {
      headers: {
        "Authorization": `token ${accessToken}`,
        "Accept": "application/vnd.github.v3+json",
      },
    });
    
    if (!response.ok) {
      throw new Error("Failed to fetch user");
    }
    
    return await response.json();
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

  async getLatestCommit(repo: string, branch: string, accessToken: string): Promise<GitHubCommit> {
    const response = await fetch(`https://api.github.com/repos/${repo}/commits/${branch}`, {
      headers: {
        "Authorization": `token ${accessToken}`,
        "Accept": "application/vnd.github.v3+json",
      },
    });
    
    if (!response.ok) {
      throw new Error("Failed to fetch latest commit");
    }
    
    return await response.json();
  },
};
