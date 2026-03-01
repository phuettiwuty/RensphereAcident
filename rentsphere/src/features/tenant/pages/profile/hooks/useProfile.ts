import { useState, useEffect, useCallback } from 'react';
import type { UserProfile } from '../types/profile.type';
import { getProfileData } from '../services/profile.service';

export const useProfile = () => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getProfileData();
      setProfile(data);
    } catch (error) {
      console.error("Error fetching profile:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const toggleEditModal = () => setIsEditModalOpen(!isEditModalOpen);
  const toggleLogoutModal = () => setIsLogoutModalOpen(!isLogoutModalOpen);
  const toggleSupportModal = () => setIsSupportModalOpen(!isSupportModalOpen);

  const handleLogout = () => {
    localStorage.removeItem("lineUserId");
    window.location.href = "/role";
  };

  const refreshProfile = () => {
    fetchProfile();
  };

  return {
    profile,
    loading,
    isEditModalOpen,
    isLogoutModalOpen,
    isSupportModalOpen,
    toggleEditModal,
    toggleLogoutModal,
    toggleSupportModal,
    handleLogout,
    refreshProfile,
  };
};
